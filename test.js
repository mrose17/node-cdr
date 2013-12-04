var cdr   = require('./cdr')
  , data
  , flags
  , i
  , len
  , littleP
  , m
  , test
  , tests = { heartbeat : '013B74616E676F3A2F2F61637563656E746F732E657372662E66723A31303030302F647365727665722F676C6F702F6D616E752E6865617274626561740101010015010000000000000001000000000000000000000000'
            , events    : '013B74616E676F3A2F2F61637563656E746F732E657372662E66723A31303030302F65742F676C6F702F30312F746865617474722E706572696F64696301010101150100000077B9000001000000007F000000000000000050C0DEC0DE05000000020000009A9999999999F13F00000000000000000000000000000000FF4D985234A70000000000000800000054686541747472000100000000000000010000000000000000000000'
            }
   ;

for (test in tests) {
  if (!tests.hasOwnProperty(test)) continue;

  console.log(test);
  data = new Buffer(tests[test], 'hex');
  i = 0;
  for (m = 0; i < data.length; m++) {
    flags = data[i++];
    if (!(flags[0] & 0x02)) len = data[i++]; else throw new Error('long message?!?');

    if (len > (data.length - i)) {
      throw new Error('expecting ' + len + ' octets, but only ' + (data.length - i) + ' octets available');
    }

    console.log('frame more=' + (!!(flags & 0x01)) + ' length=' + len);
console.log(data.slice(i, i+ len).toString('hex'));
    [ function() { console.log(data.slice(i, i + len).toString()); }
    , function() { 
        littleP = (data[i] & 0x01);
        console.log((littleP ? 'little' : 'big') + ' endian');
      }
    , function() { console.log(JSON.stringify(new cdr.decoder(data.slice(i, i + len), littleP).deMarshal('struct'))); }
    , function() { console.log(JSON.stringify(new cdr.decoder(data.slice(i, i + len), littleP).deMarshal('struct'))); }
    ][m]();
    i += len;

    if (!(flags & 0x01)) break;
    console.log('');
  }
  if (i !== data.length) throw new Error((data.length - i) + ' octets remaining');
  console.log('');console.log('');
}
