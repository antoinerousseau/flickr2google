# flickr2google

This script is designed to migrate all your Flickr sets to Google albums.
It handles resuming if the script is stopped or exits, by storing processed photos in `albums/[photoset_id].json`.

## Setup

    yarn

And create a `.env` from `example.env`

## Run

    ./start.js

## Daemonize

You can use [PM2](https://github.com/Unitech/pm2)

    pm2 start start.js --name flickr2google
