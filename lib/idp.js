const { address } = require('ip')
const express = require('express')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const session = require('express-session')
const extend = require('extend')
const { parseRequest, createResponse } = require('./auth-response')
const { createId, concatURL } = require('./util')
const { readFileSync } = require('fs')

const emptyResponse = { error: {}, username: '', password: '' }

function setOptions (opts) {
  const defaults = {
    title: 'Fake SSO IDP',
    enumerateUsers: true,
    labels: {
      selectuser: 'Select user',
      username: 'Username',
      password: 'Password',
      login: 'Log in',
      logout: 'Log out',
      details: 'Logged in',
      loggedinas: 'Logged in as',
      loginerror: 'Wrong username or password'
    },
    serviceProvider: {
      binding: 'HTTP-POST'
    },
    session: {
      secret: 'none',
      resave: false,
      saveUninitialized: false,
      name: 'idpsession'
    }
  }
  const options = extend(true, defaults, opts)

  options.labels.headline = options.labels.headline || options.title

  options.spNameQualifier = options.spNameQualifier || options.serviceProvider.metadata
  options.audience = options.audience || options.serviceProvider.metadata
  options.address = options.address || address()
  options.basepath = options.basepath || '/'

  if (opts.host || opts.port) {
    options.host = options.host || `http://localhost:${opts.port}`
    options.entity = options.entity || `${options.host}/idp`
    options.nameQualifier = options.nameQualifier || options.entity
    options.id = options.id || createId(options.entity)
  }
  return options
}

function validateUser (req, options) {
  const frm = req.body || req.query
  let user
  if (frm.userid) {
    user = options.users.find(u => u.id === frm.userid)
  } else if (frm.username && frm.password) {
    user = options.users.find(u => u.username === frm.username && u.password === frm.password)
  }
  if (user) {
    req.session.user = user
    req.session.save()
  }
  return user
}

function create (options) {
  const app = express()
  app.options = setOptions(options)

  app.set('views', `${__dirname}/views`)
  app.set('view engine', 'ejs')

  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({ extended: false }))
  app.use(cookieParser())
  app.use(session(app.options.session))
  app.use(express.static(`${process.cwd()}/public`))
  app.use(express.static(`${process.cwd()}/node_modules/purecss/build`))

  app.use('/', function (req, res, next) {
    console.log(`[${Date.now()}](${req.method}): ${req.url}`)
    next()
  })

  if (Array.isArray(options.middlewares)) {
    options.middlewares.forEach(mw => app.use(mw))
  }

  // Log in page / details
  app.get('/', (req, res) => {
    if (req.session && req.session.user) {
      res.render('details', Object.assign({}, { concatURL: concatURL }, { user: req.session.user }, emptyResponse, app.options))
    } else {
      res.render('login', Object.assign({}, { concatURL: concatURL }, emptyResponse, app.options, { action: concatURL('/') }))
    }
  })
  // Do log in
  app.post('/', (req, res) => {
    const user = validateUser(req, app.options)
    if (user) {
      res.render('details', Object.assign({}, { concatURL: concatURL }, { user: req.session.user }, emptyResponse, app.options))
    } else {
      res.redirect(app.options.basepath)
    }
  })
  // Log out
  app.get('/logout', (req, res) => {
    req.session.destroy()
    res.redirect(app.options.basepath)
  })

  // SSO using HTTP-REDIRECT
  app.get('/sso', (req, res) => {
    return parseRequest(req.query)
      .then(request => {
        req.session.request = request
        req.session.save()
      })
      .then(() => {
        if (req.session.user) {
          const response = createResponse(app.options, req.session.request, req.session.user)
          res.render('postResponse', response)
        } else {
          res.render('login', Object.assign({}, { concatURL: concatURL }, emptyResponse, app.options, { action: concatURL('/authenticate') }))
        }
      })
  })

  // SSO using HTTP-POST
  app.post('/sso', (req, res) => {
    return parseRequest(req.body)
      .then(request => {
        req.session.request = request
        req.session.save()
      })
      .then(() => {
        if (req.session.user) {
          const response = createResponse(app.options, req.session.request, req.session.user)
          res.render('postResponse', response)
        } else {
          res.render('login', Object.assign({}, { concatURL: concatURL }, emptyResponse, app.options, { action: concatURL('/authenticate') }))
        }
      })
  })

  // AUTHENTICATE
  app.post('/authenticate', (req, res) => {
    const user = validateUser(req, app.options)
    if (user) {
      const response = createResponse(app.options, req.session.request, user)
      res.render('postResponse', response)
    } else {
      const error = { message: app.options.labels.loginerror }
      res.render('login', Object.assign({}, { concatURL: concatURL }, { error }, emptyResponse, app.options, { action: concatURL('/authenticate') }))
    }
  })

  // METADATA
  app.get('/metadata', (req, res) => {
    const publicKey = readFileSync(`${__dirname}/certs/public.pem`, { encoding: 'utf8' }) // .replace('-----BEGIN CERTIFICATE-----', '').replace('-----END CERTIFICATE-----', '').replace(/\n/, '>>>')
    console.log('---------------------------------------------------')
    console.log('Public key:', publicKey)
    console.log('---------------------------------------------------')

    res.setHeader('Content-Type', 'text/xml');
    res.render('metadata', Object.assign({ metadata: { publicKey } }, { concatURL: concatURL }, app.options))
  })

  const _listen = app.listen.bind(app)
  app.listen = (port, cb) => {
    app.options = setOptions(extend(true, { port }, app.options))
    const server = _listen(port, cb)
    console.log(`Server running on port: ${port}`)
    console.log(`base path: ${app.options.basepath}`)
    return Object.assign(app, { server })
  }

  return app
}

module.exports = { create }
