var fs   = require('fs')
    zmq  = require('zmq')
  , pull = zmq.socket('pull')
  ;

pull.connect('tcp://127.0.0.1:9000');

var i = 0;

pull.on('message', function(message) {
  fs.writeFile(process.pid + '.' + (i++) + '.zmq', message, { encoding: 'binary', mode: 0444 }, function(err) {
    if (!!err) throw err;
  });
});
