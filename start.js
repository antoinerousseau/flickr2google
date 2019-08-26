#!/usr/bin/env node

const flickrConnect = require("./flickr")
const googleConnect = require("./google")

const { ALBUMS_PATH } = require("./constants")
const { log, logError, readJson, writeJson, fileExists, mkdir } = require("./utils")

const media = process.env.MEDIA || "all" // "photos" or "videos"
const extras = "url_o,media,path_alias,original_format"
const per_page = 500 // max

const getAlbumPath = (id) => `${ALBUMS_PATH}/${id}.json`

if (!fileExists(ALBUMS_PATH)) {
  mkdir(ALBUMS_PATH)
}

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

  const memory = {}

  photosets.forEach((set) => {
    const path = getAlbumPath(set.id)
    if (fileExists(path)) {
      memory[set.id] = readJson(path)
      if (set.photos != null && memory[set.id].num_photos !== set.photos) {
        // number of photos has changed since last time, update:
        memory[set.id].num_photos = set.photos
        writeJson(path, memory[set.id])
      }
      if (set.videos != null && memory[set.id].num_videos !== set.videos) {
        // number of videos has changed since last time, update:
        memory[set.id].num_videos = set.videos
        writeJson(path, memory[set.id])
      }
    } else {
      memory[set.id] = {
        title: set.id === "NotInSet" ? "Not in a set" : set.title._content,
        flickr_set: set.id,
        google_album: null,
        num_photos: set.photos,
        num_videos: set.videos,
        total: set.photos + set.videos,
        uploaded_photos: 0,
        uploaded_videos: 0,
        done: [],
      }
      writeJson(path, memory[set.id])
    }
  })

  for (let i = 0; i < photosets.length; i++) {
    const photoset_id = photosets[i].id
    const path = getAlbumPath(photoset_id)
    const data = memory[photoset_id]

    if (media === "photos" && data.num_photos === data.uploaded_photos) {
      continue
    }
    if (media === "videos" && data.num_videos === data.uploaded_videos) {
      continue
    }
    if (media === "all" && data.num_photos + data.num_videos === data.uploaded_photos + data.uploaded_videos) {
      continue
    }

    const total_photos = data.num_photos == null ? "?" : data.num_photos
    const total_videos = data.num_videos == null ? "?" : data.num_videos

    log(
      `Fetching ${media} in "${data.title}" set ${i + 1}/${photosets.length};`,
      `Flickr id: ${photoset_id};`,
      `Total: ${total_photos} photos & ${total_videos} videos`
    )

    // FOR EACH PHOTOSET, RETRIEVE PHOTOS

    let photoset
    let page = 0
    do {
      page++
      if (photoset_id === "NotInSet") {
        const { body } = await flickr.photos.getNotInSet({
          // https://www.flickr.com/services/api/flickr.photos.getNotInSet.html
          media,
          extras,
          per_page,
          page,
        })
        photoset = body.photos

        const totalNotInSet = Number(photoset.total)

        if (!totalNotInSet) {
          continue
        }
        if (media === "photos" && data.num_photos == null) {
          data.num_photos = totalNotInSet
          writeJson(path, data)
        }
        if (media === "videos" && data.num_videos == null) {
          data.num_videos = totalNotInSet
          writeJson(path, data)
        }
        if (media === "all" && data.total == null) {
          data.total = totalNotInSet
          writeJson(path, data)
        }
      } else {
        const { body } = await flickr.photosets.getPhotos({
          // https://www.flickr.com/services/api/flickr.photosets.getPhotos.html
          photoset_id,
          user_id,
          media,
          extras,
          per_page,
          page,
        })
        photoset = body.photoset
      }

      const { photo: items, pages } = photoset

      log(
        `Processing page ${page}/${pages} (${items.length} ${media === "all" ? "items" : media});`,
        media === "all" ? `Done ${data.done.length}` : ""
      )

      if (!data.google_album) {
        const albumRequest = {
          album: {
            title: data.title,
          },
        }
        const { json: album } = await post("albums", albumRequest)
        log(`Created Google album; id: ${album.id}`)
        data.google_album = album.id
        writeJson(path, data)
      }

      for (let j = 0; j < items.length; j++) {
        const item = items[j]
        if (data.done.includes(item.id)) {
          continue
        }

        let url
        if (item.media === "video") {
          url = `https://www.flickr.com/photos/${item.pathalias}/${item.id}/play/orig/${item.originalsecret}/`
          // TODO: does not work for some videos
          // https://www.flickr.com/groups/51035612836@N01/discuss/72157621698855558/
        } else {
          url = item.url_o
        }

        // FOR EACH PHOTO, UPLOAD TO GOOGLE PHOTOS

        let uploadToken
        try {
          uploadToken = await stream(url, `flickr_${item.id}.${item.originalformat}`)
        } catch (err) {
          logError(err)
          continue
        }

        const mediaItem = {
          // https://developers.google.com/photos/library/reference/rest/v1/mediaItems/batchCreate
          albumId: data.google_album,
          newMediaItems: [
            {
              description: item.title,
              simpleMediaItem: {
                uploadToken,
              },
            },
          ],
        }
        const {
          json: { newMediaItemResults: results },
          status,
        } = await post("mediaItems:batchCreate", mediaItem)

        if (status === 200) {
          if (results.length === 1 && results[0].mediaItem && !results[0].status.code) {
            data.done.push(item.id)
            data[`uploaded_${item.media}s`]++
            writeJson(path, data)
            log("Created media item @", results[0].mediaItem.productUrl)
          } else {
            logError("Media Item creation status 200 OK but wrong response:", results[0].status)
          }
        } else {
          logError("Could not create media item", results[0].status)
        }
      }
    } while (page < photoset.pages)
  }
}

main()
  .then(() => {
    log("END!")
    process.exit(0)
  })
  .catch((error) => {
    logError(error)
    process.exit(1)
  })
