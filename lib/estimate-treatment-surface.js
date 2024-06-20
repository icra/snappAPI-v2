const pl = require('nodejs-polars');
const gl = require('./globals');
const {predictSurfaces} = require("./predict-regression-models");
const {isDefined} = require("./utils");
const {chooseModel} = require("./mechanistic-models");

const estimateTreatmentSurface = async function(body, techs){

    // calculate previous variables
    if (body.inhabitants === undefined) body.inhabitants = body.inflow / body.litresPerson * 1000
    if (body.inflow === undefined) body.inflow = body.inhabitants * body.litresPerson * 0.001
    let pe = body.inhabitants * gl.waterTypes[body.waterType].pe
    if (body.pollutantsConcentrations !== undefined) {
        // bodIN must be in grams, inflow is in m3, and bod_in is in mg/l, which is the same as g/m3
        var bodIn = body.pollutantsConcentrations.bod_in ? body.pollutantsConcentrations.bod_in * body.inflow : undefined
    }
    let colM2PE = 'm2_pe_' + body.climate
    // techs = techs.filter(pl.col(colM2PE).lt(100000))
    let colGrBODM2 = 'gr_bod_m2_' + body.climate
    let polls_in = []
    if (body.pollutantsConcentrations !== undefined) {
        polls_in = Object.keys(body.pollutantsConcentrations)
            .filter(poll => poll.endsWith('_out'))
            .map(poll => poll.replace('_out', ''))
    }

    // Go on cascade model
    techs = techs.toRecords()
        for (let i = 0; i < techs.length; i++) {

            let regressionSurfaces = []
            let mechanisticSurfaces = []

            if (polls_in.length > 0 || techs[i].lost_flowrate === 1) {
                try{
                    regressionSurfaces = await predictSurfaces(techs[i], body, polls_in)
                } catch (e) {
                    console.log(techs[i].id, "error")
                    console.log(e)
                }
            }

            let some_null_regression = polls_in.length > 0 && regressionSurfaces.some(e => e.surface === null)

            if (some_null_regression) {
                let polls_not_null = polls_in.filter(poll => regressionSurfaces.some(e => e.poll === poll && e.surface === null))
                let ruleOfThumb = useM2PE(techs[i], pe, colM2PE)
                let priorSurface = techs[i].vertical == 0 ? ruleOfThumb.surface_mean : ruleOfThumb.vertical_surface_mean
                mechanisticSurfaces = chooseModel(techs[i], body, polls_not_null, priorSurface)
            }
            let surface = null
            if(regressionSurfaces.length + mechanisticSurfaces.length > 0){
                let surfaces = [].concat(regressionSurfaces, mechanisticSurfaces)
                    .filter(e => e.surface !== null)
                if (surfaces.length > 0) {
                    surface = surfaces.reduce((prev, current) => (prev.surface < current.surface) ? prev : current)
                }
            }

            // if models returns null goes down into cascade model
            if (surface !== null && surface.surface_uncertainty !== undefined){
                techs[i].surface_method = surface.method
                techs[i].surface_pollutant = surface.poll
                techs[i].surface_rmae = surface.rmae
                techs[i].surface_n_obs = surface.n
                techs[i].surface_load_removal = surface.load_removal

                techs[i] = assignSurface(techs[i], surface.surface_uncertainty, addUncertainty = false)

            } else if (surface !== null) {
                techs[i].surface_method = surface.method
                if (techs[i].surface_method === "tis_model") {
                    techs[i].surface_pollutant = surface.pollutant
                    techs[i].surface_k = surface.k
                    techs[i].surface_c_star = surface.c_star
                    techs[i].surface_N = surface.N,
                    techs[i].surface_load_removal = surface.load_removal
                }
                techs[i] = assignSurface(techs[i], surface.surface, addUncertainty = true)
                // console.log(techs[i].id, techs[i].surface_mean, techs[i].surface_low, techs[i].surface_high)
            } else {
                // calculate surface using organic loading ratio
                if (bodIn !== undefined && techs[i][colGrBODM2]) {
                    techs[i] = useGrBODM2(techs[i], bodIn, colGrBODM2)
                    // calculate surface using m2_pe (rule of thumb)
                } else if (techs[i][colM2PE] && techs[i][colM2PE] < 100000) {
                    techs[i] = useM2PE(techs[i], pe, colM2PE)
                }
            }
        }
    let df = pl.readRecords(techs)

    if (body.area !== undefined)
        df = df.filter(pl.col('surface_low').ltEq(body.area))
    if (body.verticalArea !== undefined)
        df = df.filter(pl.col('vertical_surface_low').ltEq(body.verticalArea))

    return df
}

const useGrBODM2 = function(tech, bodIn, colGrBODM2){
    let surface = bodIn / tech[colGrBODM2]
    tech = assignSurface(tech, surface)
    tech.surface_method = "organic_loading_rate"
    return tech
}
const useM2PE = function(tech, pe, colM2PE){
    let surface = tech[colM2PE] * pe
    tech = assignSurface(tech, surface)
    tech.surface_method = 'ratio_m2_pe'
    return tech
}

const assignSurface = function(tech, surface, addUncertainty = true){
    if (addUncertainty){
        var low = surface * (1 - gl.uncertainty)
        var high = surface * (1 + gl.uncertainty)
        var mean = surface
    } else {
        var low = surface[0]
        var high = surface[2]
        var mean = surface[1]
    }

    if (tech.vertical === 0){
        tech.surface_mean = mean
        tech.surface_low = low
        tech.surface_high = high
        tech.vertical_surface_mean = 0;
        tech.vertical_surface_low = 0;
        tech.vertical_surface_high = 0;
    } else if (tech.vertical === 1){
        tech.surface_mean = 0
        tech.surface_low = 0
        tech.surface_high = 0
        tech.vertical_surface_mean = mean;
        tech.vertical_surface_low = low;
        tech.vertical_surface_high = high;
    }

    return tech

}

const estimateCSOSurface = function(body, techs){

    techs = techs.withColumns(
        pl.col("hlr_m3_m2_year_high").pow(-1).mul(body.spilledVolume).alias("surface_low"),
        pl.col("hlr_m3_m2_year_low").pow(-1).mul(body.spilledVolume).alias("surface_high")
    ).withColumn(
        pl.col("surface_low").add(pl.col("surface_high")).divideBy(2).alias("surface_mean")
    )

    techs = techs.toRecords().map(v => ({...v, vertical_surface_mean: 0}))
    techs = pl.readRecords(techs)

    return techs
}

module.exports = {
    estimateTreatmentSurface,
    estimateCSOSurface
}