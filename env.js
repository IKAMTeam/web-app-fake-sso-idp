require('dotenv').config()
const { cleanEnv, url, port, bool, str } = require('envalid')

const env = cleanEnv(process.env, {
  PORT: port({ default: 7000 }),
  ENUMERATEUSERS: bool({ default: true }),
  DESTINATION: url(),
  METADATA: url(),
  BASEPATH: str({ default: '/' }),
  IDP_PUBLIC_URL: str()
})

module.exports = { env }
