const fs = require("fs")
const readline = require("readline")
const request = require("request")
const HttpError = require("standard-http-error")

const GOOGLE_API_ENDPOINT = "https://photoslibrary.googleapis.com/v1/"

exports.readJson = (path) => JSON.parse(fs.readFileSync(path))
exports.writeJson = (path, data) => fs.writeFileSync(path, JSON.stringify(data, null, 2))
exports.fileExists = (path) => fs.existsSync(path)
exports.mkdir = (path) => fs.mkdirSync(path)

exports.prompt = (question) =>
  new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    rl.question(question, (answer) => {
      answer = answer.trim()
      if (answer) {
        resolve(answer)
      } else {
        reject(new Error("You must enter a verify token"))
      }
      rl.close()
    })
  })

exports.asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

exports.transfert = (url, filename, accessToken) =>
  new Promise((resolve, reject) => {
    request
      .get(url)
      // .on("response", (response) => {
      //   console.log("downloaded", response.statusCode, response.statusMessage, response.headers)
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
              Authorization: `Bearer ${accessToken}`,
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

exports.post = (path, payload, accessToken) =>
  new Promise((resolve, reject) => {
    request.post(
      {
        url: GOOGLE_API_ENDPOINT + path,
        headers: {
          "Content-type": "application/json",
          Authorization: `Bearer ${accessToken}`,
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
            console.warn(response.statusCode, response.statusMessage)
            reject(err)
          }
        }
      }
    )
  })
