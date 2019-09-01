# flickr2google

This script is designed to migrate all your Flickr sets to Google albums.
It handles resuming if the script is stopped or exits, by storing processed photos in `albums/[photoset_id].json`.

## Requirements

You need [Node.js](https://nodejs.org/)

## Setup

Clone this repository, `cd` into it, and install its dependencies by typing `npm i`.

Then create a `.env` file based on `example.env` (`cp {example,}.env`), and edit it:

- To set the `FLICKR_APP_*` values, [create a Flickr app](https://www.flickr.com/services/apps/create/apply/) as a Mobile Application with Read permissions
- To set the `GOOGLE_CLIENT_*` values, [enable the Google Photos API](https://developers.google.com/photos/library/guides/get-started?hl=fr) and allow `https://antoinerousseau.github.io/flickr2google/` as a callback URL in your API credentials

## Run

    ./start.js

## Daemonize

You can use [PM2](https://github.com/Unitech/pm2)

    pm2 start start.js --name flickr2google

## Limitations

- This script does not handle videos
- If your Google storage is limited and you hit the limit, the Google API will return a "Bad Request". You must then either buy more storage, or go to your [Google Photos settings](https://photos.google.com/settings), choose "High Quality" and click "Recover storage". This will convert your uploads to [16 Megapixels compressed photos](https://support.google.com/photos/answer/6220791), which the API cannot do on the fly. Also, you can only convert once per day.
