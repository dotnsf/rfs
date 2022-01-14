/* rfs.ddl */

/* records */
drop table records;
create table if not exists records ( id varchar(50) not null primary key, file_id varchar(50) not null, parent_id varchar(50) default '', name varchar(256) default '', owner_id varchar(50) default '', contenttype varchar(50) default '', body bytea default null, is_folder int default 0, is_deleted int default 0, is_shared int default 0, created bigint default 0, updated bigint default 0 );
