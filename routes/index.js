var express = require('express');
var router = express.Router();
const dotenv = require('dotenv')
dotenv.config()

const excels = require("../lib/excel_utils")
const gl = require("../lib/globals")
const {insertTokens, getUws} = require("../lib/database");

router.get(['/', '/docs'], async function(req, res){
    res.render('docs.pug', {
        title: "SNAPP API v2 - documentation",
        url: process.env.URL,
        technologies: excels.readTechnologiesExcel(),
        waterTypes: Object.keys(gl.wasteWaterTypes),
        climates: gl.climate,
        ecosystemServices: gl.ecosystemServices,
        weights: gl.wAccepted,
        pollutants: gl.pollutants,
        uws: await getUws(),
        polUnits: gl.concentrationsUnits
    });
});

router.post('/insert-token', async function(req, res){
    if (req.body.password !== process.env.TOKEN_PASSWORD) {
        res.status(401).end()
    } else {
        try {
            let result = await insertTokens(req.body.username)
            res.send(result)
        }
        catch (e) {
            res.status(400).send(e)
        }
    }

});

module.exports = router;
