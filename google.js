const { google } = require("googleapis")
const request = require("request")
const HttpError = require("standard-http-error")

const { GOOGLE_FILE_PATH, CALLBACK_URL, GOOGLE_API_ENDPOINT } = require("./constants")
const { log, readJson, writeJson, prompt } = require("./utils")

module.exports = async () => {
  let googleTokens

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("Could not read GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from environment.")
  }

  const googleOauth = new google.auth.OAuth2(clientId, clientSecret, CALLBACK_URL)

  googleOauth.on("tokens", (tokens) => {
    if (!tokens.refresh_token && googleTokens) {
      tokens.refresh_token = googleTokens.refresh_token // retrieve from before
    }
    writeJson(GOOGLE_FILE_PATH, tokens)
  })

  try {
    googleTokens = readJson(GOOGLE_FILE_PATH)
  } catch (error) {
    const url = googleOauth.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/photoslibrary.appendonly"],
      prompt: "consent", // to always get a refresh_token
    })

    log("Go to " + url)

    const code = await prompt("Paste your code: ")

    const { tokens } = await googleOauth.getToken(code)
    googleOauth.setCredentials(tokens)
    googleTokens = tokens
  }

  const refreshTokenIfNeeded = async () => {
    if (googleTokens.expiry_date < Date.now() + 60000) {
      // expires in less than a minute
      log("Access token expired => refreshing")

      const { tokens } = await googleOauth.refreshToken(googleTokens.refresh_token)
      tokens.refresh_token = googleTokens.refresh_token // because it's not sent again, only the first time
      googleTokens = tokens // eslint-disable-line require-atomic-updates
    }
  }

  const stream = async (url, filename) => {
    await refreshTokenIfNeeded()
    return new Promise((resolve, reject) => {
      request
        .get(url)
        // .on("response", (response) => {
        //   log("downloaded", response.statusCode, response.statusMessage, response.headers)
        // })
        .on("error", (error) => {
          reject(error)
        })
        .pipe(
          request.post(
            {
              url: GOOGLE_API_ENDPOINT + "uploads",
              headers: {
                // "Content-type": "application/octet-stream",
                // "Content-length": set by stream
                "X-Goog-Upload-File-Name": filename,
                "X-Goog-Upload-Protocol": "raw",
                Authorization: `Bearer ${googleTokens.access_token}`,
              },
            },
            (error, response, body) => {
              if (error) {
                reject(error)
              } else {
                resolve(body)
              }
            }
          )
        )
    })
  }

  const post = async (path, payload) => {
    await refreshTokenIfNeeded()
    return new Promise((resolve, reject) => {
      request.post(
        {
          url: GOOGLE_API_ENDPOINT + path,
          headers: {
            "Content-type": "application/json",
            Authorization: `Bearer ${googleTokens.access_token}`,
          },
          body: JSON.stringify(payload),
        },
        (error, response, body) => {
          if (error) {
            reject(error)
          } else if (response.statusCode >= 400) {
            reject(new HttpError(response.statusCode, response.statusMessage))
          } else {
            try {
              resolve({
                json: JSON.parse(body),
                status: response.statusCode,
              })
            } catch (err) {
              log(response.statusCode, response.statusMessage)
              reject(err)
            }
          }
        }
      )
    })
  }

  return { stream, post }
}
