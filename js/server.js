'use strict';

var express = require('express');
var JWTStrategy = require('@sap/xssec').JWTStrategy;
var xsenv = require('@sap/xsenv');
var passport = require('passport');
var winston = require('winston');
var routes = require('./routes/index');

// load env
// xsenv.loadEnv("../internal/default-env.json");

var PORT = process.env.PORT || 3000;

var app = express();

// log level
winston.level = process.env.winston_level || 'info';

/**
 * Setup JWT authentication strategy
 */
passport.use(new JWTStrategy(xsenv.getServices({xsuaa:{tag:'xsuaa'}}).xsuaa));

//use passport for authentication
app.use(passport.initialize());

/*
 * Use JWT password policy for all routes.
 */
app.use('/',
    passport.authenticate('JWT', {session: false}),
    routes.test,
    routes.routes
  );

/*
 * Handle errors globally.
 */
app.use(function(err, req, res, next) {
    console.error(err);
    res.status(err.status || 500);
    res.json({error: err.message}, null, 4);
   });

//start the HTTP server
app.listen(PORT, function () {
    console.log('Server running on http://localhost:' + PORT);
});
