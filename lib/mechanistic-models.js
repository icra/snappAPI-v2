const {ratio_HF_GW} = require("./globals");

const tisModelTechs = ['HSSF_CW', 'HF_GW']

const chooseModel = function(tech, body, polls_in, priorSurface){
    if (tisModelTechs.includes(tech.id)){
        // ratio is the proportion between length and width
        let ratio = tech.id.endsWith("CW") ? 2 : 10
        let depth = tech.id.endsWith("CW") ? 0.7 : 0.2
        let surfaces = tisModels(body, polls_in, priorSurface, ratio, depth)
        // multiply surface by ratio_HF_GW
        if (tech.vertical === 1) surfaces.forEach(s => {s.surface = s.surface * ratio_HF_GW})
        return surfaces
    }
    else return []
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tis model //////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const tisModels = function(body, polls_in, priorSurface, ratio, depth){
    let surfaces = []
    let surface_pollutant = ""
    for (let poll of polls_in){
        let surface = tisModel(
            c_in = body.pollutantsConcentrations[poll + '_in'],
            c_out = body.pollutantsConcentrations[poll + '_out'],
            pol = poll,
            Q = body.inflow,
            A = priorSurface,
            ratio = ratio,
            depth = depth
            )
        surfaces.push({
            surface: surface.surface,
            k: surface.k,
            N: surface.N,
            c_star: surface.c_star,
            poll: poll,
            method: "tis_model",
            load_removal: (c_in - c_out) * Q
        })
    }
    return surfaces
}

const tisModel = function(c_in, c_out, pol, Q, A, ratio, depth) {
    // define params
    let surface
    let k
    let c_star
    let theta
    let L = Math.sqrt(A * ratio)
    let h = depth
    let N = 0.686 * Math.pow(L / h, 0.671)
    if (pol === "bod") {
        c_star = 0.6 + 0.4 * Math.pow(c_in, 0.55)
        theta = 0.981
        if (c_in > 200) {
            k = 66;
        } else if (c_in > 100) {
            k = 25;
        } else if (c_in > 30) {
            k = 37;
        } else if (c_in > 3) {
            k = 86
        } else {
            return null
        }
    } else if (pol === "cod") {
        k = 37.6
        theta = 1
        c_star = 0
    } else if (pol === "nh4"){
        k = 11.4
        theta = 1.014
        c_star = 0
    } else if (pol === "tn"){
        k = 8.4
        theta = 1.005
        c_star = 1
    } else if (pol === "no3") {
        k = 41.8
        theta = 1.110
        c_star = 0
    } else if (pol === "tp"){
        k = 60
        theta = 1
        c_star = 0.002
    } else {
        return null
    }

    if (c_star >= c_out) return null

    surface = (Math.pow((c_out - c_star) / (c_in - c_star), (-1/N)) - 1) * Q * 365 * N / k

    return {
        surface: surface,
        k: k,
        N: N,
        c_star: c_star,
    }
}

module.exports = {
    chooseModel
}