const findNBS = require('./find-nbs')
const {isKeyValueObject} = require("./utils");
const gl = require('./globals');
const {estimateSwmSurface} = require("./estimate-swm-surface");
const pl = require('nodejs-polars')
const {estimateCost} = require("./estimate-cost");
const {estimateTreatmentSurface} = require("./estimate-treatment-surface");

const mcda = async function(body){

    if (body === undefined) return {error: "body must contain tech of techIds keys"}
    if (body.techs !== undefined){
        if (!(body.techs instanceof Array)) return {error: "techs must be an array of technologies"}
        var df = body.techs
    } else if (body.techIds !== undefined){
        if (!(body.techIds instanceof Array)) return {error: "techIds must be an array of technologies IDs"}
        var df = await findNBS.findNBS({techIds: body.techIds, waterType: body.waterType ? body.waterType : "any_wastewater"})
        if (df.error) return df
    } else {
        return {error: "body must contain techs or techIds"}
    }

    if (!(df.map(e => e.module).every( (val, i, arr) => val === arr[0])))
        return {error: "comparing technologies for water treatment and for stormwater management can produce unreliable outputs"}

    // Multifunctionality
    df.forEach(tech => {
        let techEs = Object.keys(tech)
            .filter((key) => key.startsWith("es_"))
            .reduce((obj, key) => {
                return Object.assign(obj, {
                    [key]: tech[key]
                });
            }, {});
        // Calculate average of all ecosystem services and scale between 0 and 1.
        tech.score_multifunctionality = (Object.values(techEs).reduce((a, b) => a + b, 0) / Object.values(techEs).length)/3
    })

    // Operation & manteinance
    df.forEach(tech => {
        // calculate, normalize and invert score (0 worse and 1 better)
        tech.score_operation = 1 - ((tech.inv_es_manpower + tech.inv_es_skills)/2)/3
    })

    // Surface requirements
    if (df[0].surface_mean !== undefined){
        let surfaces = df.map(tech => tech.surface_mean + tech.vertical_surface_mean)
        console.log("minSurface", surfaces)
        let minSurface = Math.min(...surfaces)

        df.forEach(tech => {
            // normalize and invert score (0 more surface 1 less surface
            tech.score_space_requirements = minSurface / (tech.surface_mean + tech.vertical_surface_mean)
        })
    } else {
        // In case of SWM we are interested in max not in min, so, we invert the sign and then invert back when calculating the weighted score
        let surfaces = df.map(tech => tech.module === "treatment" ? tech.m2_pe_tropical : -(tech.storage_capacity_low * tech.depth))
        let minSurface = Math.min(...surfaces)

        df.forEach(tech => {
            // normalize and invert score (0 more surface 1 less surface)
            let surface = tech.module === "treatment" ? tech.m2_pe_tropical : (tech.storage_capacity_low * tech.depth)
            tech.score_space_requirements = tech.module === "treatment" ? minSurface / surface : surface / -minSurface
        })
    }

    // Environmental impacts = eutrophication + biohazard + energy
    if (df[0].module === "treatment" || df.every(e => e.cso_discharge_water === 1)) {
        df.forEach(tech => {
            // normalize and invert score (0 more impact 1 less impact
            let nh4_removal = tech.nh4_removal >= 80 ? 1 : 0
            tech.score_env_impact = ((1 - tech.energy)
                    + nh4_removal
                    + tech.no3_removal
                    + (1 - (tech.inv_es_biohazard / 3)))
                / 4
        })
    }
    // Cost in €/m2
    let fake_surface = false
    if (df.every(tech => tech.cost_high !== null && tech.cost_high !== undefined)) {
        if (df[0].estimated_cost_mean === undefined) {
            fake_surface = true
            if (df[0].module === "treatment") {
                df.forEach(tech => tech.estimated_cost_mean = tech.m2_pe_temperate * 100 *
                    ((tech.cost_low + tech.cost_high) / 2))
                console.log(df)

            } else if (df[0].module === "swm") {
                df = estimateSwmSurface({spilledVolume: 100, duration: 2, infiltrationSoils: "clay"}, pl.readRecords(df))
                df = estimateCost(df)
                df = df.toRecords()
            }
        }

        let costs = df.map(tech => tech.estimated_cost_mean)
        let minCost = Math.min(...costs)

        df.forEach(tech => {
            tech.score_cost = minCost / tech.estimated_cost_mean
        });

        if (fake_surface){
            df.forEach(tech => {
                delete tech.surface_mean
                delete tech.surface_high
                delete tech.surface_low
                delete tech.vertical_surface_mean
                delete tech.vertical_surface_high
                delete tech.vertical_surface_low
                delete tech.max_volume
                delete tech.enough_area
                delete tech.estimated_cost_high
                delete tech.estimated_cost_low
                delete tech.estimated_cost_mean
            })
        }
    }

    if (body.weights !== undefined) {
        var weights = calculateWeights(body.weights)
        if (weights.error) return weights
    } else {
        var weights = {}
        for (key of gl.wAccepted){
            weights[key] = 1 / gl.wAccepted.length
        }
    }

    df.forEach(tech => {
        tech.weighted_multifunctionality = tech.score_multifunctionality * weights.wMultifunctionality
        tech.weighted_operation = tech.score_operation * weights.wOperation
        tech.weighted_space_requirements = tech.score_space_requirements * weights.wSpaceRequirements
        if(tech.score_env_impact) tech.weighted_env_impact = tech.score_env_impact * weights.wEnvImpact
        if(tech.score_cost) tech.weighted_cost = tech.score_cost * weights.wCost

    })
    return(df)
}

const calculateWeights = function(weights){
    // Sanity checks
    if (!isKeyValueObject(weights)) return {error: 'weights must be an object of key value pairs'}
    let wKeys = Object.keys(weights)
    let wValues = Object.values(weights)
    if (!(wKeys.every(w => gl.wAccepted.includes(w)))) return {error: 'weights not in the list of accepted weights'}
    if(!wValues.every(w => w >= 0 && w <= 5)) return {error: 'weights must be a value between 0 and 5'}

    // Create array of complete values following categories of wAccepted
    // Missing keys get default weight
    let wDefault = 2.5

    for (const [i, key] of gl.wAccepted.entries()){
        if (!wKeys.includes(key)) {
            wKeys.push(key)
            wValues.push(wDefault)
        }
    }

    // Convert weights to proportions (total = 1)
    let wTotal = wValues.reduce((a, b) => a + b)
    let wPerc
    if (wTotal === 0) wPerc = wValues.map(() => 1 / wValues.length)
    else wPerc = wValues.map(w => w / wTotal)

    // Reconstruct weights
    wKeys.forEach((key, i) => {
        weights[key] = wPerc[i]
    })

    return weights
}

module.exports = {
    mcda,
    calculateWeights
}