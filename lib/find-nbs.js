const pl = require("nodejs-polars")
const gl = require("./globals")
const utils = require("./utils")
const {estimateSurface} = require("./estimate-surface");

const findNBS = function (body){

    if(body === undefined || !body instanceof Object) return {error: "body must be an object"}
    if(body instanceof Array) return {error: "body must be an object, not an array"}

    let df = pl.readCSV("public/technologies.csv")
    df = df.dropNulls("id")

    // waterType
    if (body.waterType !== undefined) {
        if (typeof body.waterType !== 'string') return {error: "waterType must be a string"}
        if (!Object.keys(gl.waterTypes).includes(body.waterType)) return {error: "waterType is not in the list"}

        // Aquí hi ha valors de possible, però al només acceptar un tipus d'aigua no podem fer l'acordat
        df = df.filter(pl.col(body.waterType).eq(1))
    } else {
        body.waterType = "any_wastewater"
    }

    // TODO: Instead of a separate module, we can add rainwater and runoff water to combine SWM and treatment
        // Rainwater does not need treatment
        // Runoff needs (at least TSS)
        // CSO should also be part of this combinations
        // In this cases, the surface should be estimated to handle volume instead of load (or both)
        // Iridra and Katarina Tondera can help with the calculations of the surface

    // inflow in m3/day
    if (body.inflow !== undefined){
        if(!utils.isPositive(body.inflow)) return {error: "inflow must be a positive number"}
    }

    // litresPerson
    if (body.litresPerson) {
        if (!utils.isPositive(body.litresPerson)) return {error: "litresPerson must be a positive number"}
    } else {
        // use predefined value for litresPerson
        body.litresPerson = 120
    }

    // inhabitants
    if (body.inflow === undefined && body.inhabitants !== undefined) {
        if (!utils.isPositive(body.inhabitants)) return {error: "inhabitants must be a positive number"}

        // in m3/day
        body.inflow = body.inhabitants * body.litresPerson / 1000
    }

    // vertical
    if (body.vertical === false){
        df = df.filter(pl.col("vertical").eq(0))
    }

    // Available area
    if (body.area !== undefined) {
        if (!utils.isPositive(body.area)) return {error: "area must be a positive number"}
    }

    // Available vertical area
    if (body.verticalArea !== undefined) {
        if (body.vertical === false) return {error: "you are providing a vertical area but rejecting vertical technologies"}
        if (!utils.isPositive(body.verticalArea)) return {error: "verticalArea must be a positive number"}
    }

    // Climate
    if (body.climate !== undefined){
        if (!gl.climate.includes(body.climate)) return {error: "climate is not in the list of accepted climates"}
    }

    if (body.avgTemperature !== undefined){
        if (isNaN(body.avgTemperature)) return {error: "avgTemperature must be a number"}
        if(body.climate === undefined) body.climate = utils.climate(body.avgTemperature)
        if(body.climate !== utils.climate(body.avgTemperature))
            return {error: "avgTemperature does not correspond with climate, pick one of both"}
    }

    // if climate is not defined temperate is default
    if(!body.climate) body.climate = "temperate"

    if (body.climate === "continental"){
      df = df.filter(pl.col("m2_pe_continental").lt(100000))
    }

    if (body.household !== undefined){
        if (![true, false].includes(body.household)) return {error: "household must be true or false"}
        if (body.household === true){
            df = df.filter(pl.col("household_building_solutions").eq(1))
        }
    }

    if (body.pollutants !== undefined){
        if(!(body.pollutants instanceof Array)) return {error: 'pollutants must be an array'}
        if(!body.pollutants.every(e => gl.pollutants.includes(e))) return {error: "pollutants must be in the list"}

        for (const pol of body.pollutants){
            // Aquí s'haurien d'incloure els possible, però no hi ha cap tecnologia amb un possible a pollutants, de moment.
            df = df.filter(pl.col(pol).eq(1))
        }
    }

    // Ecosystem services
    if (body.ecosystemServices !== undefined){
        let test_keys = Object.keys(body.ecosystemServices)
        if (test_keys.length === 0 || test_keys === ['0']) return ({error: 'ecosystemServices must be an object with key:value'})
        for (const [key, value] of Object.entries(body.ecosystemServices)){
            if(!gl.ecosystemServices.includes(key)) return ({error: `${key} is not in the list of admitted ecosystem services`})
            if(![0,1,2,3].includes(value)) return ({error: `Value for ${key} must be between 0 and 3`})

            df = df.filter(pl.col(key).gtEq(value))
        }
    }

    // TODO: add filter for barriers and energy
    // TODO: add fitler for pollutants removal and concentrations.

    // TODO: estimate surface
    df = estimateSurface(body, df)

    if(body.area !== undefined)
        df = df.filter(pl.col('surface_low').ltEq(body.area))
    if(body.verticalArea !== undefined)
        df = df.filter(pl.col('vertical_surface_low').ltEq(body.verticalArea))

    return df.toRecords()
}

const findNBSMultiple = function(body){
    if (!(body instanceof Array)) return {error: "Body must be an array, for one scenario use 'find-nbs' route"}

    let result = []

    body.forEach(scenario => {
        let oneResult = findNBS(scenario)
        if (oneResult.error) result.push([oneResult])
        else result.push(oneResult)
    });

    return result
}

module.exports = {
    findNBS,
    findNBSMultiple
}