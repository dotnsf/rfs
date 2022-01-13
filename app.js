//. app.js
//.   - https://qiita.com/nogitsune413/items/f413268d01b4ea2394b1
//.   - `select ra.id, ra.parent_id, ra.name, ra.updated from records as ra inner join (select id, parent_id, max(updated) as maxupdated from records group by id, parent_id) as rb on ra.id = rb.id and ra.parent_id = rb.parent_id and ra.updated = rb.maxupdated;`

//. - [ ] is_deleted = 1 でも検索できる関数

var express = require( 'express' ),
    multer = require( 'multer' ),
    bodyParser = require( 'body-parser' ),
    fs = require( 'fs' ),
    ejs = require( 'ejs' ),
    session = require( 'express-session' ),
    uuidv1 = require( 'uuid/v1' ),
    app = express();

var settings = require( './settings' );


process.env.PGSSLMODE = 'no-verify';

var PG = require( 'pg' );
PG.defaults.ssl = true;
var database_url = 'DATABASE_URL' in process.env ? process.env.DATABASE_URL : settings.database_url; 
var pg = null;
if( database_url ){
  console.log( 'database_url = ' + database_url );
  pg = new PG.Pool({
    connectionString: database_url,
    idleTimeoutMillis: ( 3 * 86400 * 1000 )
  });
  pg.on( 'error', function( err ){
    console.log( 'error on working', err );
    if( err.code && err.code.startsWith( '5' ) ){
      try_reconnect( 1000 );
    }
  });
}

function try_reconnect( ts ){
  setTimeout( function(){
    console.log( 'reconnecting...' );
    pg = new PG.Pool({
      connectionString: database_url,
      idleTimeoutMillis: ( 3 * 86400 * 1000 )
    });
    pg.on( 'error', function( err ){
      console.log( 'error on retry(' + ts + ')', err );
      if( err.code && err.code.startsWith( '5' ) ){
        ts = ( ts < 10000 ? ( ts + 1000 ) : ts );
        try_reconnect( ts );
      }
    });
  }, ts );
}


app.use( multer( { dest: './tmp/' } ).single( 'file' ) );
app.use( bodyParser.urlencoded( { extended: true } ) );
app.use( bodyParser.json() );
app.use( express.Router() );
app.use( express.static( __dirname + '/public' ) );

app.set( 'views', __dirname + '/views' );
app.set( 'view engine', 'ejs' );

//. env values
var settings_auth0_callback_url = 'AUTH0_CALLBACK_URL' in process.env ? process.env.AUTH0_CALLBACK_URL : settings.auth0_callback_url; 
var settings_auth0_client_id = 'AUTH0_CLIENT_ID' in process.env ? process.env.AUTH0_CLIENT_ID : settings.auth0_client_id; 
var settings_auth0_client_secret = 'AUTH0_CLIENT_SECRET' in process.env ? process.env.AUTH0_CLIENT_SECRET : settings.auth0_client_secret; 
var settings_auth0_domain = 'AUTH0_DOMAIN' in process.env ? process.env.AUTH0_DOMAIN : settings.auth0_domain; 

//. Auth0
var passport = require( 'passport' );
var Auth0Strategy = require( 'passport-auth0' );
var strategy = new Auth0Strategy({
  domain: settings_auth0_domain,
  clientID: settings_auth0_client_id,
  clientSecret: settings_auth0_client_secret,
  callbackURL: settings_auth0_callback_url
}, function( accessToken, refreshToken, extraParams, profile, done ){
  //console.log( accessToken, refreshToken, extraParams, profile );
  profile.idToken = extraParams.id_token;
  return done( null, profile );
});
passport.use( strategy );

passport.serializeUser( function( user, done ){
  done( null, user );
});
passport.deserializeUser( function( user, done ){
  done( null, user );
});

//. Session
var sess = {
  secret: 'RfsSecret',
  cookie: {
    path: '/',
    maxAge: (7 * 24 * 60 * 60 * 1000)
  },
  resave: false,
  saveUninitialized: true
};
//if( redisClient ){
//  sess.store = new RedisStore( { client: redisClient } );
//}
app.use( session( sess ) );
app.use( passport.initialize() );
app.use( passport.session() );

app.get( '/__system/debug', function( req, res ){
  if( !req.user ){
    res.render( 'debug', { user: null } );
  }else{
    res.render( 'debug', { user: req.user } );
  }
});

//. login
app.get( '/__system/login', passport.authenticate( 'auth0', {
  scope: settings.auth0_scope
}, function( req, res ){
  res.redirect( '/__system/debug' );
  //res.contentType( 'application/json; charset=utf-8' );
  //res.write( JSON.stringify( { status: true }, null, 2 ) );
  res.end();
}));

//. logout
app.get( '/__system/logout', function( req, res ){
  req.logout();
  //res.contentType( 'application/json; charset=utf-8' );
  //res.write( JSON.stringify( { status: true }, null, 2 ) );
  //res.end();
  res.redirect( '/__system/debug' );
});

app.get( '/__system/callback', async function( req, res, next ){
  passport.authenticate( 'auth0', function( err, user ){
    if( err ) return next( err );
    if( !user ) return res.redirect( '/__system/login' );

    req.logIn( user, function( err ){
      if( err ) return next( err );
      var owner_id = user.id;
      if( owner_id && owner_id.startsWith( 'auth0|' ) ){
        owner_id = owner_id.substr( 6 );
      }

      //res.contentType( 'application/json; charset=utf-8' );
      //res.write( JSON.stringify( { status: true, owner_id: owner_id }, null, 2 ) );
      //res.end();
      res.redirect( '/__system/debug' );
    })
  })( req, res, next );
});


app.all( '/*', async function( req, res, next ){
  if( !req.user ){
    res.redirect( '/__system/login' );
  }else{
    var owner_id = req.user.id;
    if( owner_id && owner_id.startsWith( 'auth0|' ) ){
      owner_id = owner_id.substr( 6 );
    }
    var path = req.originalUrl;

    if( path.indexOf( '?' ) > -1 ){
      var tmp = path.split( '?' );
      path = tmp[0];
      tmp[1].split( '&' ).forEach( function( param ){
        var p = param.split( '=' );
        req.query[p[0]] = p[1];
      });
    }

    var is_folder = false;
    if( path.endsWith( '/' ) ){
      is_folder = true;
      if( path.length > 1 ){
        path = path.substring( 0, path.length - 1 );
      }
    }
    
    var refer_is_deleted = true;
    if( req.query.refer_is_deleted ){
      try{
        refer_is_deleted = parseInt( req.query.refer_is_deleted );
      }catch( e ){
      }
    }

    var method = req.method;       //. GET/POST/PUT/DELETE
    if( path != '/favicon.ico' ){
      try{
        res.contentType( 'application/json; charset=utf-8' );
        console.log( 'method = ' + method + ', path = ' + path + ', is_folder = ' + is_folder );
        switch( method.toUpperCase() ){
        case 'POST':
          if( is_folder ){
            //. フォルダ作成
            var r = await addfolder( path, owner_id );
            res.status( r.code );
            res.write( JSON.stringify( r, null, 2 ) );
            res.end();
          }else{
            //. ファイル作成
            var filetype = req.file.mimetype;
            var filepath = req.file.path;
            var body = fs.readFileSync( filepath );

            var r = await addfile( path, filetype, body, owner_id );
            fs.unlink( filepath, function( err ){} );
            res.status( r.code );
            res.write( JSON.stringify( r, null, 2 ) );
            res.end();
          }
          break;
        case 'GET':
          if( is_folder ){
            //. フォルダ取得
            var r = await folderpath2records( path, owner_id, refer_is_deleted );
            res.status( r.code );
            if( r.records && r.records.length ){
              for( var i = 0; i < r.records.length; i ++ ){
                if( r.records[i].body ){ r.records[i].body = "...(" + r.records[i].body.length + ")..."; }
              }
            }
            res.write( JSON.stringify( r, null, 2 ) );
            res.end();
          }else{
            //. ファイル取得
            var r = await filepath2record( path, owner_id, refer_is_deleted );
            if( !r.status ){
              res.status( r.code );
              res.write( JSON.stringify( r, null, 2 ) );
              res.end();
            }else{
              var record = r.record;
              var body = req.query.body;
              if( !body ){
                //delete record['body'];
                if( record['body'] ){ record['body'] = "...(" + record['body'].length + ")..."; }
                record['created'] = parseInt( record['created'] );
                record['updated'] = parseInt( record['updated'] );
                res.write( JSON.stringify( record, null, 2 ) );
                res.end();
              }else{
                res.contentType( record.contenttype );
                res.end( record.body, 'binary' );
              }
            }
          }
          break;
        case 'PUT':
          var record = req.body;  //. { path: '/newpath', name: 'newname', .. }

          //. path -> parent_id に変換
          if( record.path ){
            var r = await folderpath2id( record.path, owner_id, true );
            if( r && r.status ){
              record.parent_id = r.id;
            }
            delete record['path'];
          }

          if( is_folder ){
            //. フォルダ更新
            var r = await editfolder( path, record, owner_id );
            res.status( r.code );
            res.write( JSON.stringify( r, null, 2 ) );
            res.end();
          }else{
            var filepath = '';
            if( req.file && req.file.path ){
              //. ファイル作成
              record.contenttype = req.file.mimetype;
              filepath = req.file.path;
              record.body = fs.readFileSync( filepath );
            }

            //. ファイル更新
            var r = await editfile( path, record, owner_id );
            if( filepath ){
              fs.unlink( filepath, function( err ){} );
            }
            res.status( r.code );
            res.write( JSON.stringify( r, null, 2 ) );
            res.end();
          }
          break;
        case 'DELETE':
          if( is_folder ){
            //. フォルダ削除
            var r = await deletefolder( path, owner_id );
            res.status( r.code );
            res.write( JSON.stringify( r, null, 2 ) );
            res.end();
          }else{
            //. ファイル削除
            var r = await deletefile( path, owner_id );
            res.status( r.code );
            res.write( JSON.stringify( r, null, 2 ) );
            res.end();
          }
          break;
        default :
          res.status( 400 );
          res.write( JSON.stringify( { status: false, error: "not supported method." }, null, 2 ) );
          res.end();
          break;
        }
      }catch( e ){
        console.log( e );
        res.status( 400 );
        res.write( JSON.stringify( { status: false, error: e }, null, 2 ) );
        res.end();
      };
    }else{
      res.status( 400 );
      res.write( JSON.stringify( { status: false, error: "not supported file." }, null, 2 ) );
      res.end();
      //next();
    }
  }
});

//. ↑で処理するので、ここへはこない、はず
app.get( '/:path', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  //console.log( req );
  var originalUrl = req.originalUrl;
  var p = JSON.stringify( { status: true, originalUrl: originalUrl }, null, 2 );
  res.write( p );
  res.end();
});



async function AddFolderRecord( parent_id, name, owner_id ){
  return new Promise( async function( resolve, reject ){
    try{
      if( pg ){
        conn = await pg.connect();
        var id = uuidv1();
        var ts = ( new Date() ).getTime();
        sql = "insert into records( id, parent_id, name, owner_id, is_folder, created, updated ) values( $1, $2, $3, $4, $5, $6, $7 )";
        query = { text: sql, values: [ id, parent_id, name, owner_id, 1, ts, ts ] };
        conn.query( query, function( err, result ){
          if( err ){
            resolve( { status: false, code: 400, error: err } );
          }else{
            resolve( { status: true, code: 200 } );
          }
        });
      }else{
        resolve( { status: false, code: 400, error: 'db not ready.' } );
      }
    }catch( e ){
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }finally{
      conn.release();
    }
  });
}

async function AddFileRecord( parent_id, name, contenttype, body, owner_id ){
  return new Promise( async function( resolve, reject ){
    try{
      if( pg ){
        conn = await pg.connect();
        var id = uuidv1();
        var ts = ( new Date() ).getTime();
        sql = "insert into records( id, parent_id, name, owner_id, contenttype, body, is_folder, created, updated ) values( $1, $2, $3, $4, $5, $6, $7, $8, $9 )";
        query = { text: sql, values: [ id, parent_id, name, owner_id, contenttype, body, 0, ts, ts ] };
        conn.query( query, function( err, result ){
          if( err ){
            resolve( { status: false, code: 400, error: err } );
          }else{
            resolve( { status: true, code: 200 } );
          }
        });
      }else{
        resolve( { status: false, code: 400, error: 'db not ready.' } );
      }
    }catch( e ){
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }finally{
      conn.release();
    }
  });
}

async function UpdateFolderRecord( base_record, new_record, owner_id ){
  return new Promise( async function( resolve, reject ){
    if( base_record && base_record.owner_id && base_record.owner_id == owner_id ){
      try{
        if( pg ){
          conn = await pg.connect();
          var ts = ( new Date() ).getTime();
          //. ただインサートするだけだと古いフォルダが残ってしまう
          //. まず古いレコードの削除フラグを 1 にする
          var sql = "update records set is_deleted = 1, updated = $1 where id = $2 and updated = $3";
          var query = { text: sql, values: [ ts, base_record.id, base_record.updated ] };
          conn.query( query, function( err, result ){
            if( err ){
              console.log( err );
              resolve( { status: false, code: 400, error: err } );
            }else{
              //. new_record に含まれる要素のみで base_record を上書き
              Object.keys( new_record ).forEach( function( key ){
                if( new_record[key] ){
                  base_record[key] = new_record[key];
                }
              });

              //. 新しいレコードを作成する
              sql = "insert into records( id, parent_id, name, owner_id, is_folder, created, updated ) values( $1, $2, $3, $4, $5, $6, $7 )";
              query = { text: sql, values: [ base_record['id'], base_record['parent_id'], base_record['name'], base_record['owner_id'], 1, base_record['created'], ts ] };
              conn.query( query, function( err, result ){
                if( err ){
                  console.log( err );
                  resolve( { status: false, code: 400, error: err } );
                }else{
                  resolve( { status: true, code: 200 } );
                }
              });
            }
          });
        }else{
          resolve( { status: false, code: 400, error: 'db not ready.' } );
        }
      }catch( e ){
        console.log( e );
        resolve( { status: false, code: 400, error: e } );
      }finally{
        conn.release();
      }
    }else{
      resolve( { status: false, code: 403, error: 'not owner.' } );
    }
  });
}

async function UpdateFileRecord( base_record, new_record, owner_id ){
  return new Promise( async function( resolve, reject ){
    if( base_record && base_record.owner_id && base_record.owner_id == owner_id ){
      try{
        if( pg ){
          conn = await pg.connect();
          var ts = ( new Date() ).getTime();
          //. ただインサートするだけだと古いファイルが残ってしまう
          //. まず古いレコードの削除フラグを 1 にする
          var sql = "update records set is_deleted = 1, updated = $1 where id = $2 and updated = $3";
          var query = { text: sql, values: [ ts, base_record.id, base_record.updated ] };
          conn.query( query, function( err, result ){
            if( err ){
              resolve( { status: false, code: 400, error: err } );
            }else{
              //. new_record に含まれる要素のみで base_record を上書き
              Object.keys( new_record ).forEach( function( key ){
                if( new_record[key] ){
                  base_record[key] = new_record[key];
                }
              });

              //. 新しいレコードを作成する
              sql = "insert into records( id, parent_id, name, owner_id, contenttype, body, is_folder, created, updated ) values( $1, $2, $3, $4, $5, $6, $7, $8, $9 )";
              query = { text: sql, values: [ base_record['id'], base_record['parent_id'], base_record['name'], base_record['owner_id'], base_record['contenttype'], base_record['body'], 0, base_record['created'], ts ] };
              conn.query( query, function( err, result ){
                if( err ){
                  resolve( { status: false, code: 400, error: err } );
                }else{
                  resolve( { status: true, code: 200 } );
                }
              });
            }
          });
        }else{
          resolve( { status: false, code: 400, error: 'db not ready.' } );
        }
      }catch( e ){
        console.log( e );
        resolve( { status: false, code: 400, error: e } );
      }finally{
        conn.release();
      }
    }else{
      resolve( { status: false, code: 403, error: 'not owner.' } );
    }
  });
}

async function GetRecord( id, refer_is_deleted ){
  return new Promise( async function( resolve, reject ){
    try{
      if( pg ){
        conn = await pg.connect();
        var sql = 'select * from records where id = $1';
        if( refer_is_deleted ){
          sql += ' and is_deleted = 0'
        }
        sql += ' order by updated desc';
        conn.query( sql, [ id ], function( err, result ){
          if( err ){
            resolve( { status: false, code: 400, error: err } );
          }else{
            var record = null;
            if( result.rows.length > 0 ){
              try{
                record = result.rows[0];
                record.created = parseInt( record.created );
                record.updated = parseInt( record.updated );
                //if( record.body ){ record.body = "...(" + record.body.length + ")..."; }
              }catch( e ){
              }
            }
            resolve( { status: true, code: 200, record: record } );
          }
        });
      }else{
        resolve( { status: false, error: 'db not ready.' } );
      }
    }catch( e ){
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }finally{
      conn.release();
    }
  });
}

async function GetRecords( parent_id, owner_id, refer_is_deleted ){
  return new Promise( async function( resolve, reject ){
    try{
      if( pg ){
        conn = await pg.connect();
        ///var sql = 'select * from records where parent_id = $1 and owner_id = $2 order by created asc';
        //var sql = 'select ra.id, ra.parent_id, ra.name, ra.owner_id, ra.contenttype, ra.body, ra.is_folder, ra.is_deleted, ra.is_shared, ra.created, ra.updated from records as ra inner join (select id, parent_id, max(updated) as maxupdated from records group by id, parent_id) as rb on ra.id = rb.id and ra.parent_id = rb.parent_id and ra.updated = rb.maxupdated and ra.parent_id = $1 and ra.owner_id = $2 and ra.is_deleted = ' + isDeleted;
        var sql = 'select ra.id, ra.parent_id, ra.name, ra.owner_id, ra.contenttype, ra.body, ra.is_folder, ra.is_deleted, ra.is_shared, ra.created, ra.updated from records as ra inner join (select id, parent_id, max(updated) as maxupdated from records group by id, parent_id) as rb on ra.id = rb.id and ra.parent_id = rb.parent_id and ra.updated = rb.maxupdated and ra.parent_id = $1 and ra.owner_id = $2';
        if( refer_is_deleted ){
          sql += ' and ra.is_deleted = 0'
        }
        conn.query( sql, [ parent_id, owner_id ], function( err, result ){
          if( err ){
            console.log( err );
            resolve( { status: false, code: 400, error: err } );
          }else{
            var records = [];
            if( result.rows.length > 0 ){
              try{
                for( var i = 0; i < result.rows.length; i ++ ){
                  result.rows[i].created = parseInt( result.rows[i].created );
                  result.rows[i].updated = parseInt( result.rows[i].updated );
                  //if( result.rows[i].body ){ result.rows[i].body = "...(" + result.rows[i].body.length + ")..."; }
                  records.push( result.rows[i] );
                }
              }catch( e ){
                console.log( e );
              }
            }
            resolve( { status: true, code: 200, records: records } );
          }
        });
      }else{
        resolve( { status: false, code: 400, error: 'db not ready.' } );
      }
    }catch( e ){
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }finally{
      conn.release();
    }
  });
}

async function GetFileRecord( parent_id, name, owner_id, refer_is_deleted ){
  return new Promise( async function( resolve, reject ){
    try{
      if( pg ){
        conn = await pg.connect();
        var sql = 'select * from records where parent_id = $1 and name = $2 and owner_id = $3 and is_folder = 0';
        if( refer_is_deleted ){
          sql += ' and is_deleted = 0'
        }
        sql += ' order by updated desc';
        conn.query( sql, [ parent_id, name, owner_id ], function( err, result ){
          if( err ){
            resolve( { status: false, code: 400, error: err } );
          }else{
            var record = null;
            if( result.rows.length > 0 && result.rows[0].id ){
              try{
                record = result.rows[0];
                record.created = parseInt( record.created );
                record.updated = parseInt( record.updated );
              }catch( e ){
              }
            }
            resolve( { status: true, code: 200, record: record } );
          }
        });
      }else{
        resolve( { status: false, code: 400, error: 'db not ready.' } );
      }
    }catch( e ){
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }finally{
      conn.release();
    }
  });
}

function GetFolderRecord( parent_id, name, owner_id, refer_is_deleted ){
  return new Promise( async function( resolve, reject ){
    try{
      if( pg ){
        conn = await pg.connect();
        var sql = 'select * from records where parent_id = $1 and name = $2 and owner_id = $3 and is_folder = 1';
        if( refer_is_deleted ){
          sql += ' and is_deleted = 0'
        }
        sql += ' order by updated desc';
        conn.query( sql, [ parent_id, name, owner_id ], function( err, result ){
          if( err ){
            resolve( { status: false, code: 400, error: err } );
          }else{
            var record = null;
            if( result.rows.length > 0 && result.rows[0].id ){
              try{
                record = result.rows[0];
                record.created = parseInt( record.created );
                record.updated = parseInt( record.updated );
              }catch( e ){
              }
            }
            resolve( { status: true, code: 200, record: record } );
          }
        });
      }else{
        resolve( { status: false, code: 400, error: 'db not ready.' } );
      }
    }catch( e ){
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }finally{
      conn.release();
    }
  });
}

async function DeleteFolderRecord( parent_id, name, owner_id ){
  return new Promise( async function( resolve, reject ){
    console.log( 'DeleteFolderRecord: parent_id = ' + parent_id + ', name = ' + name + ', owner_id = ' + owner_id );
    var r = await GetFolderRecord( parent_id, name, owner_id, true );
    if( r && r.status && r.record ){
      try{
        var ts = ( new Date() ).getTime();
        if( pg ){
          conn = await pg.connect();
          sql = "update records set is_deleted = 1, updated = $1 where id = $2 and updated = $3 and is_folder = 1";
          query = { text: sql, values: [ ts, r.record.id, r.record.updated ] };
          conn.query( query, function( err, result ){
            if( err ){
              console.log( err );
              resolve( { status: false, code: 400, error: err } );
            }else{
              resolve( { status: true, code: 200 } );
            }
          });
        }else{
          resolve( { status: false, code: 400, error: 'db not ready.' } );
        }
      }catch( e ){
        console.log( e );
        resolve( { status: false, code: 400, error: e } );
      }finally{
        conn.release();
      }
    }else{
      resolve( r );
    }
  });
}

async function DeleteFileRecord( parent_id, name, owner_id ){
  return new Promise( async function( resolve, reject ){
    try{
      var r = await GetFileRecord( parent_id, name, owner_id, true );
      if( r && r.status && r.record ){
        var ts = ( new Date() ).getTime();
        sql = "update records set is_deleted = 1, updated = $1 where id = $2 and updated = $3 and is_folder = 0";
        query = { text: sql, values: [ ts, r.record.id, r.record.updated ] };
        conn.query( query, function( err, result ){
          if( err ){
            resolve( { status: false, code: 400, error: err } );
          }else{
            resolve( { status: true, code: 200 } );
          }
        });
      }else{
        resolve( r );
      }
    }catch( e ){
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }finally{
      conn.release();
    }
  });
}


async function addfile( file_path, contenttype, body, owner_id ){
  return new Promise( async function( resolve, reject ){
    try{
      filepath2id( file_path, owner_id, true ).then( function( r ){
        if( r && r.status && r.id ){
          resolve( { status: false, code: 400, error: 'file existed.' } );
        }else{
          var tmp = file_path.split( '/' );
          var filename = tmp.pop();;
          var parent_folder_path = tmp.join( '/' );
          if( parent_folder_path == '' ){ parent_folder_path = '/'; }

          folderpath2id( parent_folder_path, owner_id, true ).then( async function( r ){
            if( r && r.status && r.id ){
              var r = await AddFileRecord( r.id, filename, contenttype, body, owner_id, true );
              resolve( r );
            }else{
              resolve( r );
            }
          }).catch( function( e ){
            console.log( e );
            resolve( { status: false, code: 400, error: e } );
          });
        }
      });
    }catch( e ){
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }
  });
}

async function addfolder( folder_path, owner_id ){
  return new Promise( async function( resolve, reject ){
    try{
      folderpath2id( folder_path, owner_id, true ).then( function( r ){
        if( r && r.status && r.id ){
          resolve( { status: false, code: 400, error: 'folder existed.' } );
        }else{
          //folder_path = folder_path.substring( 0, folder_path.length - 1 );
          var tmp = folder_path.split( '/' );
          var foldername = tmp.pop();
          var parent_folder_path = tmp.join( '/' );
          if( parent_folder_path == '' ){ parent_folder_path = '/'; }
          folderpath2id( parent_folder_path, owner_id, true ).then( async function( r ){
            if( r && r.status && r.id ){
              var r = await AddFolderRecord( r.id, foldername, owner_id );
              resolve( r );
            }else{
              resolve( { status: false, code: 404, error: 'parent folder not found.' } );
            }
          }).catch( function( e ){
            console.log( e );
            resolve( { status: false, code: 400, error: e } );
          });
        }
      }).catch( function( e ){
        resolve( { status: false, code: 400, error: e } );
      });
    }catch( e ){
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }
  });
}

async function filepath2id( file_path, owner_id, refer_is_deleted ){
  return new Promise( async function( resolve, reject ){
    try{
      var tmp = file_path.split( '/' );
      var filename = tmp.pop();;
      var folder_path = tmp.join( '/' );
      if( folder_path == '' ){ folder_path = '/'; }
      folderpath2id( folder_path, owner_id, refer_is_deleted ).then( async function( r ){
        if( r && r.status && r.id ){
          var r = await GetFileRecord( r.id, filename, owner_id, refer_is_deleted );
          if( r && r.status && r.record ){
            resolve( { status: true, code: 200, id: r.record.id } );
          }else{
            resolve( { status: false, code: 404, error: 'file not found.' } );
          }
        }else{
          resolve( { status: false, code: 404, error: 'folder not found.' } );
        }
      }).catch( function( e ){
        resolve( { status: false, code: 400, error: e } );
      });
    }catch( e ){
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }
  });
}

async function folderpath2id( folder_path, owner_id, refer_is_deleted ){
  return new Promise( async function( resolve, reject ){
    //. '/' は name = '' で id = '0', parent_id = '' とする
    try{
      if( folder_path == '/' ){
        resolve( { status: true, code: 200, id: '0' } );
      }else{
        //if( folder_path.endsWith( '/' ) && folder_path.length > 1 ){
        //  folder_path = folder_path.substr( 0, folder_path.length - 1 );
        //}
        var tmp = folder_path.split( '/' );
        var id = '';
        var parent_id = '0';
        var path = '';
        var b = true;
        for( var i = 1; i < tmp.length && b; i ++ ){
          //path += '/' + tmp[i];
          path = tmp[i];
  
          var r = await GetFolderRecord( parent_id, path, owner_id, refer_is_deleted );
          if( r && r.status && r.record ){
            id = r.record.id;
            parent_id = r.record.parent_id;
          }else{
            b = false;
          }
        }

        if( b ){
          resolve( { status: true, code: 200, id: id } );
        }else{
          resolve( { status: false, code: 404, error: 'folder not found.' } );
        }
      }
    }catch( e ){
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }
  });
}

async function filepath2record( file_path, owner_id, refer_is_deleted ){
  return new Promise( async function( resolve, reject ){
    //. '/' は name = '' で id = '0', parent_id = '' とする
    try{
      var r = await filepath2id( file_path, owner_id, refer_is_deleted );
      if( r && r.status && r.id ){
        r = await GetRecord( r.id, refer_is_deleted );
        if( !r || !r.status ){
          //console.log( r );
          //. ファイルは見つかるがレコードの取得に失敗
          r = { status: false, code: 404, error: 'record not found.' };
        }
        resolve( r );
      }else{
        //. ファイルが見つからない
        //console.log( r );
        resolve( { status: false, code: 404, error: 'file not found.' } );
      }
    }catch( e ){
      //. 想定外エラー
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }
  });
}

async function folderpath2records( folder_path, owner_id, refer_is_deleted ){
  return new Promise( async function( resolve, reject ){
    //. '/' は name = '' で id = '0', parent_id = '' とする
    try{
      var r = await folderpath2id( folder_path, owner_id, refer_is_deleted );
      if( r && r.status && r.id ){
        r = await GetRecords( r.id, owner_id, refer_is_deleted );
        if( !r || !r.status ){
          //. フォルダは見つかるが子レコードの取得に失敗
          //console.log( r );
          r = { status: false, code: 404, error: 'records not found.' };
        }
        resolve( r );
      }else{
        //. フォルダが見つからない
        //console.log( r );
        resolve( { status: false, code: 404, error: 'folder not found.' } );
      }
    }catch( e ){
      //. 想定外エラー
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }
  });
}

async function editfile( file_path, record, owner_id ){
  return new Promise( async function( resolve, reject ){
    try{
      filepath2id( file_path, owner_id, true ).then( function( r ){
        if( r && r.status && r.id ){
          var tmp = file_path.split( '/' );
          var filename = tmp.pop();;
          var folder_path = tmp.join( '/' );
          if( folder_path == '' ){ folder_path = '/'; }
          folderpath2id( folder_path, owner_id, true ).then( async function( r ){
            if( r && r.status && r.id ){
              var r = await GetFileRecord( r.id, filename, owner_id, true );
              if( r && r.status && r.record ){
                //. r.record のレコードを record の内容に変更する
                //var r = await EditFileRecord( r.record.id, record.parent_id, record.name, record.contenttype, record.body, r.record.created, owner_id );
                var r = await UpdateFileRecord( r.record, record, owner_id );
                resolve( r );
              }else{
                resolve( r );
              }
            }else{
              resolve( r );
            }
          });
        }else{
          resolve( r );
        }
      });
    }catch( e ){
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }
  });
}

async function editfolder( folder_path, record, owner_id ){
  return new Promise( async function( resolve, reject ){
    try{
      folderpath2id( folder_path, owner_id, true ).then( function( r ){
        if( r && r.status && r.id ){
          var tmp = folder_path.split( '/' );
          var foldername = tmp.pop();
          var parent_folder_path = '/' + tmp.join( '/' );
          if( !parent_folder_path ){ parent_folder_path = '/'; }
          folderpath2id( parent_folder_path, owner_id, true ).then( async function( r ){
            if( r && r.status && r.id ){
              var r = await GetFolderRecord( r.id, foldername, owner_id, true );
              if( r && r.status && r.record ){
                //. r.record のレコードを record の内容に変更する
                //var r = await EditFolderRecord( r.record.id, record.parent_id, record.name, r.record.created, owner_id );
                var r = await UpdateFolderRecord( r.record, record, owner_id );
                resolve( r );
              }else{
                resolve( r );
              }
            }else{
              resolve( r );
            }
          });
        }else{
          resolve( r );
        }
      });
    }catch( e ){
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }
  });
}

async function deletefile( file_path, owner_id ){
  return new Promise( async function( resolve, reject ){
    try{
      filepath2id( file_path, owner_id, true ).then( function( r ){
        if( r && r.status && r.id ){
          var tmp = file_path.split( '/' );
          var filename = tmp.pop();;
          var parent_folder_path = '/' + tmp.join( '/' );

          folderpath2id( parent_folder_path, owner_id, true ).then( async function( r ){
            if( r && r.status && r.id ){
              var r = await DeleteFileRecord( r.id, filename, owner_id );
              resolve( r );
            }else{
              resolve( r );
            }
          }).catch( function( e ){
            resolve( { status: false, code: 400, error: e } );
          });
        }else{
          resolve( { status: false, code: 404, error: 'file not existed.' } );
        }
      });
    }catch( e ){
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }
  });
}

async function deletefolder( folder_path, owner_id ){
  return new Promise( async function( resolve, reject ){
    try{
      folderpath2records( folder_path, owner_id, true ).then( function( r ){
        if( r && r.status && r.records.length ){
          //. 空でないフォルダは削除不可とする
          resolve( { status: false, code: 403, error: 'folder contains some.' } );
        }else{
          folderpath2id( folder_path, owner_id, true ).then( function( r ){
            if( r && r.status && r.id ){
              var tmp = folder_path.split( '/' );
              var foldername = tmp.pop();;
              var parent_folder_path = '/' + tmp.join( '/' );
              folderpath2id( parent_folder_path, owner_id, true ).then( async function( r ){
                if( r && r.status && r.id ){
                  var r = await DeleteFolderRecord( r.id, foldername, owner_id );
                  resolve( r );
                }else{
                  resolve( { status: false, code: 404, error: 'parent folder not found.' } );
                }
              }).catch( function( e ){
                console.log( e );
                resolve( { status: false, code: 400, error: e } );
              });
            }else{
              resolve( { status: false, code: 403, error: 'folder not existed.' } );
            }
          }).catch( function( e ){
            console.log( e );
            resolve( { status: false, code: 400, error: e } );
          });
        }
      }).catch( function( e ){
        console.log( e );
        resolve( { status: false, code: 400, error: e } );
      });
    }catch( e ){
      console.log( e );
      resolve( { status: false, code: 400, error: e } );
    }
  });
}

var port = process.env.PORT || 8080;
app.listen( port );
console.log( "server starting on " + port + " ..." );
