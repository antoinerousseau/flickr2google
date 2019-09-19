#!/usr/bin/env node

const flickrConnect = require("./flickr")
const googleConnect = require("./google")

const { ALBUMS_PATH } = require("./constants")
const { log, logError, readJson, writeJson, fileExists, mkdir } = require("./utils")

const getAlbumPath = (id) => `${ALBUMS_PATH}/${id}.json`

if (!fileExists(ALBUMS_PATH)) {
  mkdir(ALBUMS_PATH)
}

const per_page = 500 // max

const main = async () => {
  const { flickr, user_id } = await flickrConnect()
  const { stream, post } = await googleConnect()

  // RETRIEVE PHOTO SETS (Flickr albums)

  const {
    body: {
      photosets: { photoset: photosets },
    },
  } = await flickr.photosets.getList() // https://www.flickr.com/services/api/flickr.photosets.getList.html
  log(`Found ${photosets.length} Flickr photosets`)

  photosets.push({
    id: "NotInSet",
  })

  const albums_cache = {}

  photosets.forEach((set) => {
    const path = getAlbumPath(set.id)
    if (fileExists(path)) {
      albums_cache[set.id] = readJson(path)
      if (albums_cache[set.id].num_photos !== set.photos) {
        // number of photos has changed since last time, update:
        albums_cache[set.id].num_photos = set.photos
        writeJson(path, albums_cache[set.id])
      }
    } else {
      albums_cache[set.id] = {
        title: set.title && set.title._content,
        flickr_set: set.id,
        google_album: null,
        num_photos: set.photos,
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

    log(
      `Processing "${data.title || photoset_id}" set ${i + 1}/${photosets.length};`,
      `Flickr id: ${photoset_id};`,
      `Total: ${data.num_photos} photos`
    )

    let photoset
    let page = 0
    do {
      page++
      if (photoset_id === "NotInSet") {
        const { body } = await flickr.photos.getNotInSet({
          media: "photos",
          extras: "url_o",
          page,
        })
        photoset = body.photos
        photoset.title = "Photos not in a set"
      } else {
        const { body } = await flickr.photosets.getPhotos({
          // https://www.flickr.com/services/api/flickr.photosets.getPhotos.html
          photoset_id,
          user_id,
          media: "photos",
          extras: "url_o",
          page,
          per_page,
        })
        photoset = body.photoset
      }

      const { title, photo: photos, pages } = photoset

      log(`Processing page ${page}/${pages};`, `Done ${data.done.length % per_page}/${photos.length}`)

      if (!data.google_album) {
        const albumRequest = {
          album: {
            title,
          },
        }
        const { json: album } = await post("albums", albumRequest)
        log(`Created Google album; id: ${album.id}`)
        data.google_album = album.id
        writeJson(path, data)
      }

      for (let j = 0; j < photos.length; j++) {
        const photo = photos[j]
        if (data.done.includes(photo.id)) {
          continue
        }

        // FOR EACH PHOTO, UPLOAD TO GOOGLE PHOTOS

        const uploadToken = await stream(photo.url_o, `flickr_${photo.id}.jpg`)

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
        const {
          json: { newMediaItemResults: results },
          status,
        } = await post("mediaItems:batchCreate", media)

        if (status === 200) {
          if (results.length === 1 && results[0].mediaItem) {
            data.done.push(photo.id)
            writeJson(path, data)
            log("Created media item @", results[0].mediaItem.productUrl)
          } else {
            logError("Media Item creation status 200 OK but wrong response:", results)
          }
        } else {
          logError("Could not create media item", results[0])
        }
      }
    } while (page < photoset.pages)
  }
}

main()
  .then(() => {
    log("END!")
  })
  .catch((error) => {
    logError(error)
  })
