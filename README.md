# flickr2google

This script is designed to migrate all your Flickr sets to Google albums.
It handles resuming if the script is stopped or exits, by storing processed photos in `albums/[photoset_id].json`.

## Setup

    yarn

And create a `.env` from `example.env`:

- To set the `FLICKR_APP_*` values, [create a Flickr app](https://www.flickr.com/services/apps/create/apply/) as a Mobile Application with Read permissions
- To set the `GOOGLE_CLIENT_*` values, [enable the Google Photos API](https://developers.google.com/photos/library/guides/get-started?hl=fr) and allow `https://antoinerousseau.github.io/flickr2google/` as a callback URL in your API credentials

## Run

    ./start.js

## Daemonize

You can use [PM2](https://github.com/Unitech/pm2)

    pm2 start start.js --name flickr2google
