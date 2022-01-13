# Routing Test

## Overview

**Rest FileSystem**

REST API 対応ファイルシステム


## API

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
