#!/usr/bin/env node

require("dotenv").config()
const Flickr = require("flickr-sdk")
const { google } = require("googleapis")

const { readJson, writeJson, fileExists, mkdir, prompt, transfert, post } = require("./utils")

const CALLBACK_URL = "https://antoinerousseau.github.io/flickr2google/"
const FLICKR_FILE_PATH = "flickr_tokens.json"
const GOOGLE_FILE_PATH = "google_tokens.json"
const ALBUMS_PATH = "albums"
const getAlbumPath = (id) => `${ALBUMS_PATH}/${id}.json`

if (!fileExists(ALBUMS_PATH)) {
  mkdir(ALBUMS_PATH)
}

const flickr2google = async () => {
  // CONNECT TO FLICKR

  let flickrCredentials

  const flickrOauth = new Flickr.OAuth(
    process.env.FLICKR_APP_KEY, // app key
    process.env.FLICKR_APP_SECRET // app secret
  )

  try {
    flickrCredentials = readJson(FLICKR_FILE_PATH)
  } catch (error) {
    const {
      body: { oauth_token: requestToken, oauth_token_secret: requestTokenSecret },
    } = await flickrOauth.request(CALLBACK_URL)

    console.log("Go to https://www.flickr.com/services/oauth/authorize?oauth_token=" + requestToken)

    const verifyToken = await prompt("Paste your code: ")
    const { body } = await flickrOauth.verify(requestToken, verifyToken, requestTokenSecret)

    writeJson(FLICKR_FILE_PATH, body)

    flickrCredentials = body
  }

  const flickr = new Flickr(flickrOauth.plugin(flickrCredentials.oauth_token, flickrCredentials.oauth_token_secret))

  const user_id = flickrCredentials.user_nsid

  // CONNECT TO GOOGLE

  let googleTokens

  const googleOauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID, // client ID
    process.env.GOOGLE_CLIENT_SECRET, // client secret
    CALLBACK_URL
  )

  googleOauth.on("tokens", (tokens) => {
    if (!tokens.refresh_token && googleTokens) {
      tokens.refresh_token = googleTokens.refresh_token // retrieve from before
    }
    writeJson(GOOGLE_FILE_PATH, tokens)
  })

  const refreshTokenIfNeeded = async () => {
    if (googleTokens.expiry_date < Date.now() + 60000) {
      // expires in less than a minute
      console.warn("Warning: access token expired => refreshing")

      const { tokens } = await googleOauth.refreshToken(googleTokens.refresh_token)
      tokens.refresh_token = googleTokens.refresh_token // because it's not sent again, only the first time
      googleTokens = tokens // eslint-disable-line require-atomic-updates
    }
  }

  try {
    googleTokens = readJson(GOOGLE_FILE_PATH)

    await refreshTokenIfNeeded()
  } catch (error) {
    const url = googleOauth.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/photoslibrary.appendonly"],
      prompt: "consent", // to always get a refresh_token
    })

    console.log("Go to " + url)

    const code = await prompt("Paste your code: ")

    const { tokens } = await googleOauth.getToken(code)
    googleTokens = tokens
    googleOauth.setCredentials(googleTokens)
  }

  // RETRIEVE PHOTO SETS (Flickr albums)

  const albums_cache = {}

  const {
    body: {
      photosets: { photoset: photosets },
    },
  } = await flickr.photosets.getList() // https://www.flickr.com/services/api/flickr.photosets.getList.html

  photosets.forEach((set) => {
    const path = getAlbumPath(set.id)
    if (fileExists(path)) {
      albums_cache[set.id] = readJson(path)
    } else {
      albums_cache[set.id] = {
        title: set.title._content,
        flickr_set: set.id,
        google_album: null,
        num_photos: set.photos,
        num_videos: set.videos,
        done: [],
      }
      writeJson(path, albums_cache[set.id])
    }
  })

  for (let i = 0; i < photosets.length; i++) {
    const photoset_id = photosets[i].id
    const path = getAlbumPath(photoset_id)
    const data = albums_cache[photoset_id]
    if (data.done.length === data.num_photos) {
      continue
    }

    // FOR EACH PHOTOSET, RETRIEVE PHOTOS

    const {
      body: {
        photoset: { title, total, photo: photos },
      },
    } = await flickr.photosets.getPhotos({
      // https://www.flickr.com/services/api/flickr.photosets.getPhotos.html
      photoset_id,
      user_id,
      media: "photos",
      extras: [
        // "date_upload",
        // "date_taken",
        // "last_update",
        // "original_format",
        // "geo",
        // "tags",
        // "machine_tags",
        "o_dims",
        "url_o",
      ].join(","),
    })
    console.log(`Processing "${title}" set (${total} photos); Flickr id: ${photoset_id}`)

    if (!data.google_album) {
      const albumRequest = {
        album: {
          title,
        },
      }
      await refreshTokenIfNeeded()
      const { json: album } = await post("albums", albumRequest, googleTokens.access_token)
      console.log(`Created Google album; id: ${album.id}`)
      data.google_album = album.id
      writeJson(path, data)
    }

    for (let j = 0; j < photos.length; j++) {
      const photo = photos[j]
      if (data.done.includes(photo.id)) {
        continue
      }

      // FOR EACH PHOTO, UPLOAD TO GOOGLE PHOTOS

      await refreshTokenIfNeeded()
      const uploadToken = await transfert(photo.url_o, `flickr_${photo.id}.jpg`, googleTokens.access_token)

      const media = {
        // https://developers.google.com/photos/library/reference/rest/v1/mediaItems/batchCreate
        albumId: data.google_album,
        newMediaItems: [
          {
            description: photo.title,
            simpleMediaItem: {
              uploadToken,
            },
          },
        ],
      }
      await refreshTokenIfNeeded()
      const {
        json: { newMediaItemResults: results },
        status,
      } = await post("mediaItems:batchCreate", media, googleTokens.access_token)

      if (status === 200) {
        data.done.push(photo.id)
        writeJson(path, data)
        console.log("Created media item:", results[0].mediaItem.description || "(no description)")
      } else if (status === 207) {
        console.log("Some media items could not be created")
        results.forEach(({ uploadToken, status }) => {
          console.log(uploadToken + "\n |=> " + status)
        })
      } else {
        console.log("Could not create media item", results)
      }
    }
  }
}

flickr2google()
  .then(() => {
    console.log("END!")
  })
  .catch((error) => {
    console.error(error.message)
  })
