const Flickr = require("flickr-sdk")

const { FLICKR_FILE_PATH, CALLBACK_URL } = require("./constants")
const { log, readJson, writeJson, prompt } = require("./utils")

module.exports = async () => {
  let flickrCredentials

  const consumerKey = process.env.FLICKR_APP_KEY
  const consumerSecret = process.env.FLICKR_APP_SECRET

  if (!consumerKey || !consumerSecret) {
    throw new Error("Could not read FLICKR_APP_KEY and FLICKR_APP_SECRET from environment.")
  }

  const flickrOauth = new Flickr.OAuth(consumerKey, consumerSecret)

  try {
    flickrCredentials = readJson(FLICKR_FILE_PATH)
  } catch (error) {
    const {
      body: { oauth_token: requestToken, oauth_token_secret: requestTokenSecret },
    } = await flickrOauth.request(CALLBACK_URL)

    log("Go to https://www.flickr.com/services/oauth/authorize?oauth_token=" + requestToken)

    const verifyToken = await prompt("Paste your code: ")
    const { body } = await flickrOauth.verify(requestToken, verifyToken, requestTokenSecret)

    writeJson(FLICKR_FILE_PATH, body)

    flickrCredentials = body
  }

  const flickr = new Flickr(flickrOauth.plugin(flickrCredentials.oauth_token, flickrCredentials.oauth_token_secret))

  const user_id = flickrCredentials.user_nsid

  return { flickr, user_id }
}
