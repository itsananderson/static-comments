var storage = require('azure-storage');
var client = storage.createTableService();
var express = require('express');
var bodyParser = require('body-parser');
var uuid = require('uuid');
var util = require('util');
var moment = require('moment');

var app = express();

app.use(bodyParser.json());

var commentsTable = process.env.COMMENT_TABLE || 'comments';
var postsTable = process.env.POST_TABLE || 'posts';
var commentsPartition = process.env.COMMENT_PARTITION || 'blog1';
var postsPartition = process.env.POST_PARTITION || 'blog1';

client.createTableIfNotExists(commentsTable, function(){});
client.createTableIfNotExists(postsTable, function(){});

app.all('*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    next();
});

app.get('/uuid', function(req, res) {
    res.send(uuid.v4());
});

app.get('/post-id', function(req, res) {
    var url = req.query.url;
    var query = new storage.TableQuery()
        .top(1)
        .where('PostUrl eq ?', url);
    client.queryEntities(postsTable, query, null, function(err, result, response) {
        if (!result.entries || result.entries.length == 0) {
            res.json(404, {message: util.format('Post with url %s does not exist', url)});
        } else {
            res.json({PostId: result.entries[0].RowKey._});
        }
    });
});

app.get('/posts/:id/comments/:token?', function(req, res) {
    var id = req.params.id;
    var token = req.params.page || null;
    var query = new storage.TableQuery()
        .top(10)
        .where('PostId eq ?', id);
    client.queryEntities(commentsTable, query, token, function(err, result, response) {
        var continuationToken = result.continuationToken;
        var comments = result.entries.map(function(entry) {
            return {
                PostID: entry.PostId._,
                AuthorName: entry.AuthorName._,
                AuthorEmail: entry.AuthorEmail._,
                Comment: entry.Comment._,
                TimestampUtc: entry.TimestampUtc._
            };
        });
        res.json({
            comments: comments,
            continuationToken: continuationToken
        });
    });
});

app.post('/posts/:id/comments', function(req, res) {
    var id = req.params.id;
    var query = new storage.TableQuery()
        .top(1)
        .where('RowKey eq ?', id);
    client.queryEntities(postsTable, query, null, function(err, result, response) {
        if (!result.entries || result.entries.length == 0) {
            res.json(404, {message: util.format('Post %s does not exist', id)});
        } else {
            var entGen = storage.TableUtilities.entityGenerator;
            var entity = {
                PartitionKey: entGen.String(commentsPartition),
                RowKey: entGen.String(new Date().getTime() + '-' + uuid.v4()),
                PostId: entGen.String(id),
                AuthorName: entGen.String(req.body.AuthorName),
                AuthorEmail: entGen.String(req.body.AuthorEmail),
                Comment: entGen.String(req.body.Comment),
                TimestampUtc: entGen.Int64(moment.utc().unix())
            };
            client.insertEntity(commentsTable, entity, function(error, result, response) {
                console.log(arguments);
            });
            res.json({message: 'Successfully created comment'});
        }
    });
});

app.listen(8080);