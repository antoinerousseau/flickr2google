const fs = require("fs")
const readline = require("readline")
const { format } = require("date-fns")

const now = () => format(new Date(), "yyyy-MM-dd HH:mm:ss")

exports.log = (...args) => {
  console.log(now(), ...args)
}
exports.logError = (...args) => {
  console.error(now(), ...args)
}

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
        reject(new Error("No input"))
      }
      rl.close()
    })
  })

exports.readJson = (path) => JSON.parse(fs.readFileSync(path))
exports.writeJson = (path, data) => fs.writeFileSync(path, JSON.stringify(data, null, 2))
exports.fileExists = (path) => fs.existsSync(path)
exports.mkdir = (path) => fs.mkdirSync(path)
