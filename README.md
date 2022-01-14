# Routing Test

## Overview

**Rest FileSystem**

REST API 対応ファイルシステム


## How to setup

### Auth0

- Client ID などの設定

  - 環境変数または settings.js に以下を設定する

    - `database_url` : PostgreSQL へ接続するための URL

    - `auth0_callback_url` : Auth0 の OAuth コールバック URL

    - `auth0_client_id` : Auth0 の ClientId 値

    - `auth0_client_secret` : Auth0 の ClientSecret 値

    - `auth0_domain` : Auth0 のドメイン

    - `auth0_scope` : "openid profile email"

- コールバックURL の設定

  - 例えば `localhost:8080` で動かす場合、以下をコールバック URL に設定する

    - `http://localhost:8080/__system/callback`



## API

### システム予約リクエスト

- `GET /__system/login`

  - ログイン

- `GET /__system/logout`

  - ログアウト

- `GET /__system/histories/:file_id`

  - :file_id で示されるファイル（フォルダ）の変更履歴

- `GET /__system/share/:id`

  - :id で示されるファイルのシェア

  - `body=1` のパラメータを付けるとバイナリ実体


### HTTP リクエスト

`Method` `Path` の組み合わせからなる

- `Method`

  - POST / GET / PUT / DELETE のいずれか

  - それぞれ Create / Read / Update / Delete 処理に対応

- `Path`

  - ファイルパス／フォルダパス

    - 必ず **/** で始まる絶対パスを指定する

    - **/** で終わるパスはフォルダ、終わらないパスはファイルを示している


### ルール

- `POST /フォルダパス/` 

  - 指定したフォルダを作成するリクエスト

  - フォルダパスが `/aaa/bbb/` のように階層構造になっている場合は `/aaa/` フォルダが存在している場合のみ `/aaa/bbb/` フォルダが作成可能

- `POST /ファイルパス` 

  - 指定したファイルを作成（アップロード）するリクエスト

  - ファイルパスが `/aaa/bbb.pdf` のように階層構造になっている場合は `/aaa/` フォルダが存在している場合のみ `/aaa/bbb.pdf` ファイルが作成可能

- `GET /フォルダパス/` 

  - 指定したフォルダの中にあるファイル／フォルダ一覧を取得するリクエスト

  - 存在しているフォルダパスに対するリクエストのみ可能

- `GET /ファイルパス` 

  - 指定したファイルの情報を取得するリクエスト

  - `body=1` のパラメータを付けて実行すると、ファイルの情報ではなく、ファイルバイナリの実体を Content-Type 付きで返す

  - 存在しているファイルパスに対するリクエストのみ可能

- `PUT /フォルダパス/` 

  - 指定したフォルダを更新するリクエスト

  - リクエストボディに以下を指定可能

    - `name` : 新しいフォルダ名

    - `path` : 新しいフォルダパス

- `PUT /ファイルパス` 

  - 指定したファイルを更新するリクエスト

  - リクエストボディに以下を指定可能

    - `name` : 新しいファイル名

    - `path` : 新しい親フォルダパス

    - `shared` : 共有可(1)不可(0)

    - `file` : 新しいファイルバイナリ

- `DELETE /フォルダパス/` 

  - 指定したフォルダを削除するリクエスト

  - 子ファイルや子フォルダが存在している場合は削除不可

- `DELETE /ファイルパス` 

  - 指定したファイルを削除するリクエスト


## Reserved path

`/__system/` で始まるファイルパス／フォルダパスは予約語なので、ユーザーは使えません。


## Licensing

This code is licensed under MIT.


## Copyright

2022  [K.Kimura @ Juge.Me](https://github.com/dotnsf) all rights reserved.
