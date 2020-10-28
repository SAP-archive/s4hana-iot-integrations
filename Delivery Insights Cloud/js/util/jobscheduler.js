"use strict";

var xssec = require("@sap/xssec");
var xsenv = require('@sap/xsenv');
var axios = require("axios");

class jobscheduler {

  static jobSchedulerConfig() {
    return xsenv.getServices({
      jobscheduler: { tag: "jobscheduler" }
    }).jobscheduler;
  }

  static token(req) {
    return new Promise(function(resolve, reject) {
      req.authInfo.requestToken(jobscheduler.jobSchedulerConfig().uaa, xssec.constants.TYPE_CLIENT_CREDENTIALS_TOKEN, null, (error, token) => {
        if (error) {
          reject(error);
        } else {
          resolve(token);
        }
      });
    });
  }

  static updateJobRunLog(req, jobId, scheduleId, runId, bSuccess, message) {
    return new Promise(function(resolve, reject) {
      jobscheduler.token(req)
      .then(token => {
        var url = jobscheduler.jobSchedulerConfig().url + "/scheduler/jobs/" + jobId + "/schedules/" + scheduleId + "/runs/" + runId;
        var start = new Date();
        axios.put(url, { "success": bSuccess, "message": message}, { "headers": { "Authorization": "Bearer " +  token} })
        .then(response => {
          console.info("updateJobRunLong: " + url + " " + (new Date().getTime()-start.getTime()) + "ms");
          resolve(response.data);
        })
        .catch(error => {
          reject(error);
        });
      })
      .catch(error => {
        reject(error);
      })
    });
  }
}
module.exports = jobscheduler;
