// minimal node.js implementation of CORBA's Common Data Representation (CDR) encoding
// decoding only

// derived from "CORBA scripting with Tcl" version 0.8.1 - http://www.fpx.de/Combat/ - combat@fpx.de

var os    = require('os')
  , iconv = require('iconv-lite')
  ;


var readBuffer = function(buffer, littleP) {
  if (!(this instanceof readBuffer)) return new readBuffer(buffer);

  this.data = Buffer.isBuffer(buffer) ? buffer : new Buffer(buffer, 'binary');
  this.index = 0;
  this.encaps = [];
  this.endOfChunk = -1;

  this.byteOrder = (typeof littleP !== 'undefined') ? (!!littleP) : (os.endianness() === 'LE');
};


readBuffer.prototype.tell  = function() {
  return this.index;
};

readBuffer.prototype.seek  = function(pos) {
  this.index = pos;
};

readBuffer.prototype.align   = function(alignment) {
  var offset;

  offset = this.index % alignment;
  if (offset  !== 0) this.index += alignment - offset;

  this.checkChunk();
};

readBuffer.prototype.beginEncaps = function() {
  var length = this.ulong();

  this.encaps.push({ index: this.index, byteOrder: this.byteOrder, length: length });
  this.byteOrder = this.boolean();

  return length;
};

readBuffer.prototype.endEncaps = function() {
  var frame;

  if (this.encaps.length <= 0) throw new Error('no encapsulation in progress');

  frame = this.encaps.pop();
  this.index = frame.index + frame.length;
  this.byteOrder = frame.byteOrder;
};

readBuffer.prototype.beginChunk = function() {
  this.endOfChunk = this.index + this.ulong();
};

readBuffer.prototype.endChunk = function() {
  if (this.endOfChunk === -1) return;

  this.index = this.endOfChunk;
  this.endOfChunk = -1;
};

readBuffer.prototype.checkChunk = function () {
  if ((this.endOfChunk === -1) || (this.index >= this.endOfChunk)) return;

  this.endChunk();
  this.beginChunk();
};


readBuffer.prototype.char = function() {
  var result;

  this.checkChunk();

  if ((!!this.cdecoder) && (!!this.cdecoder.char)) return this.cdecoder.char(this);

  result = iconv.decode(this.data.slice(this.index, this.index), 'iso8859-1');
  this.index += 1;
  return result;
};

readBuffer.prototype.chars = function(length) {
  var result;

  this.checkChunk();

  if ((!!this.cdecoder) && (!!this.cdecoder.chars)) return this.cdecoder.chars(this, length);

  result = (length > 0) ? iconv.decode(this.data.slice(this.index, this.index + length - 1), 'iso8859-1') : '';
  this.index += length;
  return result;
};

readBuffer.prototype.wchar = function() {
  this.checkChunk();

  if ((!!this.wdecoder) && (!!this.wdecoder.wchar)) return this.wdecoder.wchar(this);

  throw new Error('no callback for wdecoder.wchar');
};

readBuffer.prototype.wchars = function(length) {
  this.checkChunk();

  if ((!!this.wdecoder) && (!!this.wdecoder.wchars)) return this.wdecoder.wchars(this, length);

  throw new Error('no callback for wdecoder.wchars');
};

readBuffer.prototype.octet = function() {
  var result;

  result = this.data.readUInt8(this.index);
  this.index += 1;
  return result;
};

readBuffer.prototype.octets = function(length) {
  var result;

  result = (length > 0) ? this.data.slice(this.index, this.index + length - 1) : new Buffer(0);
  this.index += length;
  return result;
};

readBuffer.prototype.number = function(prefix, octets) {
  var result;

  result = this.data[prefix + (this.byteOrder ? 'LE' : 'BE')](this.index);
  this.index += octets;
  return result;
};

readBuffer.prototype.short        = function() { return this.number('readInt16',  2); };
readBuffer.prototype.ushort       = function() { return this.number('readUInt16', 2); };
readBuffer.prototype.long         = function() { return this.number('readInt32',  4); };
readBuffer.prototype.ulong        = function() { return this.number('readUInt32', 4); };
readBuffer.prototype.float        = function() { return this.number('readFloat',  4); };
readBuffer.prototype.double       = function() { return this.number('readDouble', 8); };

readBuffer.prototype.longlong   = function() { oops('unsupported type: longlong');   };
readBuffer.prototype.ulonglong  = function() { oops('unsupported type: ulonglong');  };
readBuffer.prototype.longdouble = function() { oops('unsupported type: longdouble'); };

readBuffer.prototype.boolean = function() {
  var result;

  result = this.octet();
  if (result === 0) return false;
  if (result === 1) return true;
  throw new Error('invalid boolean value: ' + result);
};

readBuffer.prototype.string = function(length) {
  var result;

  if ((!!this.cdecoder) && (!!this.cdecoder.string)) {
    this.checkChunk();
    return this.cdecoder.string(this, length);
  }

  length = this.ulong();
  result = (length > 0) ? iconv.decode(this.data.slice(this.index, this.index + length - 1), 'iso8859-1') : '';
  this.index += length;
  return result;
};

readBuffer.prototype.wstring = function(length) {
  if ((!!this.wdecoder) && (!!this.wdecoder.wstring)) return this.wdecoder.wstring(this, length);

  this.checkChunk();
  throw new Error('no callback for wdecoder.wstring');
};


var decoder = function(buffer, littleP) {
  if (!(this instanceof decoder)) return new decoder(buffer, littleP);

  this.data = new readBuffer(buffer, littleP);
  this.nestingLevel = 0;
  this.chunking = false;
};


decoder.prototype.getIndirectString = function() {
  var buffer, offset, oldpos, pos, ref, result;

  buffer = this.data;
  pos = buffer.tell();
  ref = buffer.long();
  if (ref !== -1) {
    buffer.seek(pos);
    return buffer.string();
  }

  oldpos = buffer.tell();
  offset = buffer.long();
  buffer.seek(oldpos + offset);
  result = buffer.string();
  buffer.seek(oldpos);
  buffer.long();
  return result;
};

decoder.prototype.getIndirectStringSeq = function() {
  var buffer, i, offset, oldpos, pos, ref, result;

  result = [];
  buffer = this.data;
  pos = buffer.pos();
  ref = buffer.long();
  if (ref !== -1) {
    for (i = 0; i < ref; i++) result.push(this.getIndirectString());
    return result;
  }

  oldpos = buffer.tell();
  offset = buffer.long();
  buffer.seek(oldpos + offset);
  ref = buffer.ulong();
  for (i = 0; i < ref; i++) result.push(this.getIndirectString());
  buffer.seek(oldpos);
  buffer.long();
  return result;
};

var codes = {  0: { name    : 'null'       }
            ,  1: { name    : 'void'       }
            ,  2: { name    : 'short'      }
            ,  3: { name    : 'long'       }
            ,  4: { name    : 'ushort'     }
            ,  5: { name    : 'ulong'      }
            ,  6: { name    : 'float'      }
            ,  7: { name    : 'double'     }
            ,  8: { name    : 'boolean'    }
            ,  9: { name    : 'char'       }
            , 10: { name    : 'octet'      }
            , 11: { name    : 'any'        }
            , 12: { name    : 'TypeCode'   }
            , 13: { name    : 'Principal'  }
            , 14: { name    : 'Object'
                  , complex : true
                  , f       : function(self, tc) {
                      var name, repoid;

                      repoid = self.data.string();
                      name = self.data.string();
                      return [ tc.name, repoid ];
                    }
                  }
            , 15: { name    : 'struct'
                  , complex : true
                  , f       : function(self, tc, tckindpos) {
                      var count, i, members, mname, name, repoid;

                      repoid = self.data.string();
                      self.tcrecursion[tckindpos] = repoid;

                      name = self.data.string();
                      count = self.data.ulong();
                      members = {};
                      for (i = 0; i < count; i++) {
                        mname = self.data.string();
                        members[mname] = { value: self.deMarshal('TypeCode') };
                      }

                      delete(self.tcrecursion[tckindpos]);
                      return [ tc.name, repoid, members ];
                    }
                  }
            , 16: { name    : 'union'
                  , complex : true
                  , f       : function(self, tc, tckindpos) {
                      var count, def, disctype, i, members, mlabel, mname, name, repoid;

                      repoid = self.data.string();
                      self.tcrecursion[tckindpos] = repoid;

                      name = self.data.string();
                      disctype = self.deMarshal('TypeCode');
                      def = self.data.long();
                      count = self.data.ulong();
                      members = {};
                      for (i = 0; i < count; i++) {
                        mlabel = self.deMarshal(disctype);
                        if (def === i) mlabel = '(default)';
                        mname = self.data.string();
                        members[mname] = { label: mlabel, value: self.deMarshal('TypeCode') };
                      }

                      delete(self.tcrecursion[tckindpos]);
                      return [ tc.name, repoid, disctype, members ];
                    }
                  }
            , 17: { name    : 'enum'
                  , complex : true
                  , f       : function(self, tc) {
                      var count, i, members, name, repoid;

                      repoid = self.data.string();
                      name = self.data.string();
                      count = self.data.ulong();
                      members = {};
                      for (i = 0; i < count; i++) members[self.data.string()] = { value: i };

                      return [ tc.name, members ];
                    }
                  }
            , 18: { name    : 'string'
                  , f       : function(self, tc) {
                      var bound = self.data.ulong();

                      if (bound === 0) return tc.name;
                      return [ tc.name, bound ];
                    }
                  }
            , 19: { name    : 'sequence'
                  , complex : true
                  , f       : function(self, tc) {
                      var bound, elementType;

                      elementType = self.deMarshal('TypeCode');
                      bound = self.data.ulong();
                      if (bound === 0) return [ tc.name, elementType ];
                      return [ tc.name, elementType, bound ];
                    }
                  }
            , 20: { name    : 'array'
                  , complex : true
                  , f       : function(self, tc) {
                      var elementType, length;

                      elementType = [self.deMarshal('TypeCode')];
                      length = self.data.ulong();
                      return [ tc.name, elementType, length ];
                    }
                  }
            , 21: { name    : 'alias'
                  , complex : true
                  , f       : function(self, tc) {/* jshint unused: false */
                      var name, repoid;

                      repoid = self.data.string();
                      name = self.data.string();
                      return self.deMarshal('TypeCode');
                    }
                  }
            , 22: { name    : 'exception'
                  , complex : true
                  , f       : function(self, tc) {/* jshint unused: false */}
                  }
            , 23: { name    : 'Principal'  }
            , 24: { name    : 'longlong'   }
            , 25: { name    : 'ulonglong'  }
            , 26: { name    : 'longdouble' }
            , 27: { name    : 'wchar'      }
            , 28: { name    : 'wstring'
                  , f       : function(self, tc) {/* jshint unused: false */}
                  }
            , 29: { name    : 'fixed'
                  , f       : function(self, tc) {
                      var digits, scale;

                      digits = self.data.ushort();
                      scale = self.data.ushort();
                      return [ tc.name, digits, scale ];
                    }
                  }
            , 30: { name    : 'valuetype'
                  , complex : true
                  , f       : function(self, tc, tckindpos) {
                      var basetc, count, i, members, modifier, mname, mtype, mvisi, name, repoid, vtype;

                      repoid = self.data.string();
                      self.tcrecursion[tckindpos] = repoid;

                      name = self.data.string();
                      mtype = self.data.short();
                      modifier = { 0: '', 1: 'custom', 2: 'abstract', 3: 'truncatable' }[mtype];
                      if (!modifier) throw new Error('unknown valuetype modifier: ' + mtype);

                      basetc = self.deMarshal('Typecode');
                      if (basetc === null) basetc = 0;
                      count = self.data.ulong();
                      members = {};
                      for (i = 0; i < count; i++) {
                        mname = self.data.string();
                        mtype = self.deMarshal('TypeCode');
                        vtype = self.data.short();
                        mvisi = { 0: 'private', 1: 'public' }[vtype];
                        if (!mvisi) throw new Error('unknown visibility indicator: ' + vtype);
                        members[mname] = { visibility: mvisi, type: mtype };
                      }

                      delete(self.tcrecursion[tckindpos]);
                      return [ tc.name, repoid, members, basetc, modifier ];
                    }
                  }
            , 31: { name    : 'valuebox'
                  , complex : true
                  , f       : function(self, tc) {
                      var name, originalType, repoid;

                      repoid = self.data.string();
                      name = self.data.string();
                      originalType = self.deMarshal('TypeCode');
                      return [ tc.name, repoid, originalType ];
                    }
                  }
            , 32: { name    : 'native'
                  , complex : true
                  , f       : function(self, tc) {
                      var name, repoid;

                      repoid = self.data.string();
                      name = self.data.string();
                      return [ tc.name, repoid ];
                    }
                  }
            , 33: { name    : 'abstractinterface'
                  , complex : true
                  , f       : function(self, tc) {/* jshint unused: false */}
                  }
            };
codes[22].f = codes[15].f;    // exception equiv. struct
codes[28].f = codes[18].f;    // wstring   equiv. string
codes[33].f = codes[32].f;    // abstractinterface equiv. native;

decoder.prototype.TypeCode = function() {
  var buffer, curpos, kind, offset, origpos, result, tc;

  buffer = this.data;
  kind = buffer.long();
  if (kind === -1) {
    curpos = buffer.tell();
    offset = buffer.long();
    origpos = curpos + offset;
    if (!!this.tcrecursion[origpos]) return [ 'recursive', this.tcrecursion[origpos] ];

    buffer.seek(origpos);
    result = this.TypeCode();
    buffer.seek(curpos + 4);
    return result;
  }

  tc = codes[kind];
  if (!tc) throw Error('unknown TypeCode: ' + kind);
  if (!tc.f) return tc.name;

  if (!tc.complex) return (tc.f)(this, tc);

  buffer.beginEncaps();
  result = (tc.f)(this, tc, buffer.tell() - 4);
  buffer.endEncaps();
  return result;
};

decoder.prototype.any = function() {
  var type, value;

  type = this.deMarshal('TypeCode');
  value = this.deMarshal(type);

  return [ type, value ];
};

decoder.prototype.recursive = function(tc) {
  var repoid, result, savetc;

  repoid = tc[1];
  savetc = this.marshalrecursion[repoid];
  if (!savetc) throw new Error('invalid marshalling recursion for ' + repoid);

  result = this.deMarshal(savetc);
  this.marshalrecursion[repoid] = savetc;
  return result;
};

decoder.prototype.deMarshal = function(tc) {
  var f, type;

  if (tc === 'any')      return this.any();
  if (tc === 'TypeCode') return this.TypeCode();
  f = { null       : function() { return null; }
      , void       : function() { return     ; }
      };
  if (!!f[tc]) return (f[tc])();
  if (!!this.data[tc]) return this.data[tc]();

  type = tc[0];
  f = { string            : function(tc) {
        }
      , wstring           : function(tc) {
        }
      , struct            : function(tc) {
        }
      , union             : function(tc) {
        }
      , exception         : function(tc) {
        }
      , sequence          : function(tc) {
        }
      , array             : function(tc) {
        }
      , enum              : function(tc) {
        }
      , object            : function(tc) {
        }
      , valuetype         : function(tc) {
        }
      , valuebox          : function(tc) {
        }
      , abstractinterface : function(tc) {
        }
      };
  if (!!f[tc]) return (f[tc])(tc);

  throw new Error('unknown type: ' + JSON.stringify(tc));
};



// indicates something we should support, but presently do not
var oops = function(m) { throw new Error(m); };


exports.decoder = decoder;
