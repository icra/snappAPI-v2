const pl = require("nodejs-polars");
const MLR = require("ml-regression-multivariate-linear");
const db = require("./database")
const gl = require("./globals");
const {readTechnologiesExcel} = require("./excel_utils");
const {addRegressionModel, queryAllRegressionModels} = require("./database");

const trainRegressionModels = async function(body){
    if (body.password !== process.env.TOKEN_PASSWORD) return {error: "Password is not correct, please contact the administrator"}

    let allModels = await queryAllRegressionModels()
    console.log("Valid models before training:", allModels.length)

    let df = await db.sciStudiesToPolars()
    let techsPl = readTechnologiesExcel(id = false, records = false)
        .filter(pl.col("module").eq(pl.lit("treatment")))
    techs = techsPl['sub_type'].toArray()

    let total_iterations = techs.length * gl.polConcentrations.length
    let i = 0
    let progress = 0

    for (tech of techs){
        let lostFlowRate = techsPl.filter(pl.col("sub_type").eq(pl.lit(tech))).lost_flowrate.toArray()[0]

        if (lostFlowRate === 1) { // Zero discharge systems, model based on HLR (surface ~ inflow)
            df = df.filter(pl.col('sub_type').eq(pl.lit(tech)))
                .withColumns(
                    pl.col('inflow'),
                    pl.col('inflow').mul(0).alias("outflow")
                )

            let model = {}
            model.tech = tech
            model.pol = "HLR"
            model.n = df.shape.height
            model.min_load_in = df["inflow"].min()
            model.max_load_in = df["inflow"].max()

            if (model.n < 5){
                model.null_model = "less than 5 cases"
                await addRegressionModel(model)
                continue
            }

            if (df.surface.toArray().every(e => e === df.surface.toArray()[0])){
                model.null_model = "surface is constant"
                await addRegressionModel(model)
                continue
            }

            let bestModel = compareRegressions(df)

            model.type = bestModel.type
            model.RMAE = bestModel.rmae
            model.intercept = bestModel.type === "power" ? bestModel.weights[1][0] : 0
            model.beta_load_removal = bestModel.weights[0][0]
            model.std_error = bestModel.stdError

            if (bestModel.rmae > 0.25) {
                model.null_model = "rmae > 25%"
                model.intercept = null
                model.beta_load_removal = null
            }
            await addRegressionModel(model)

        } else { // Model for combination of pollutants based on load_removal
            for (pol of gl.polConcentrations){
                i = i + 1
                new_progress = Math.round(i / total_iterations * 100)
                if (new_progress !== progress) {
                    progress = Math.round(i / total_iterations * 100)
                    if (progress % 10 === 0) console.log(progress + "%")
                }

                let model = {}
                model.pol = pol
                model.tech = tech

                let polio = [pol + "_in", pol + "_out"]
                // subset technology and check if more than 5 cases
                let dfTechPol = subsetTechnology(df, tech, polio, lostFlowRate)

                model.n = dfTechPol.shape.height
                model.min_load_in = dfTechPol["load_in"].min()
                model.max_load_in = dfTechPol["load_in"].max()

                if (model.n < 5){
                    model.null_model = "less than 5 cases"
                    await addRegressionModel(model)
                    continue
                }

                if (dfTechPol.surface.toArray().every(e => e === dfTechPol.surface.toArray()[0])){
                    model.null_model = "surface is constant"
                    await addRegressionModel(model)
                    continue
                }

                // compare three regressions using relative MAE (in percentage)
                let bestModel = compareRegressions(dfTechPol, polio)

                model.type = bestModel.type
                model.RMAE = bestModel.rmae
                model.intercept = bestModel.type === "power" ? bestModel.weights[1][0] : 0
                model.beta_load_removal = bestModel.weights[0][0]
                model.std_error = bestModel.stdError

                if (bestModel.rmae > 0.25) {
                    model.null_model = "rmae > 25%"
                    model.intercept = null
                    model.beta_load_removal = null
                }
                await addRegressionModel(model)
            }
        }
    }

    allModels = await queryAllRegressionModels()
    console.log("Valid models after training:", allModels.length)
    return allModels
}

const subsetTechnology = function(df, tech, polio, lostFlowRate){
    df = df.select(["sub_type", polio[0], polio[1], "inflow", "surface"])
        .dropNulls()
        .filter(pl.col("sub_type").eq(pl.lit(tech)))
        .filter(pl.col("surface").gt(0))
        .filter(pl.col("inflow").gt(0))
        .filter(pl.col(polio[0]).gt(pl.col(polio[1])))
        .withColumn(
            pl.col("inflow").mul(1 - lostFlowRate).alias("outflow")
        )
        .withColumns(
            pl.col(polio[0]).mul(pl.col("inflow")).alias("load_in"),
            pl.col(polio[1]).mul(pl.col("outflow")).alias("load_out")
        )
    return df

}

const compareRegressions = function(df){

    let linear = linearRegression(df)
    let exponential = expRegression(df)
    let power = powerRegression(df)

    let models = [linear, exponential, power]
    let min = Math.min(...models.map(item => item.rmae))
    let bestModel = models.filter(item => item.rmae === min)

    return bestModel[0]
}

const linearRegression = function(df){

    if(df.outflow.toArray().every(e => e === 0)) {
        df = df.withColumns(
            pl.col('inflow').alias("load_removal"),
        )
    } else {
        df = df.withColumns(
            pl.col('load_in').minus(pl.col('load_out')).alias("load_removal"),
        )
    }

    // load removal is in g because inflow is in m3 and concentration in mg/l
    let x = df["load_removal"].toArray().map(e=>[e])
    let y = df["surface"].toArray().map(e=>[e])

    let mlr = new MLR(x, y, {intercept: false})
    let prediction = mlr.predict(x).map(e=>e[0])
    mlr.type = "linear"
    mlr.rmae = calcRMAE(df, prediction)

    return mlr
}

const expRegression = function(df){
    return {rmae: Infinity, type: "exponential"}

    if (df.outflow.toArray().every(e => e === 0)) {
        df = df.withColumns(
            pl.col('inflow').alias("load_removal"),
        )
    } else {
        df = df.withColumns(
            pl.col('load_in').divideBy(pl.col('load_out')).alias("load_removal")
        )
    }

    df = df
        .filter(pl.col('load_removal').neq(0))
        .filter(pl.col('load_removal').isFinite())

    if(df.shape.height < 5) return {rmae: Infinity, type: "exponential"}

    // load removal is in g because inflow is in m3 and concentration in mg/l
    let x = df["load_removal"].toArray().map(e=>[Math.log(e)])
    let y = df["surface"].toArray().map(e=>[e])

    let mlr = new MLR(x, y, {intercept: false})
    let prediction = mlr.predict(x).map(e=>e[0])

    mlr.type = "exponential"
    mlr.rmae = calcRMAE(df, prediction)

    return mlr
}

const powerRegression = function(df){
    if (df.outflow.toArray().every(e => e === 0)) {
        df = df.withColumns(
            pl.col('inflow').alias("load_removal"),
        )
    } else {
        df = df.withColumns(
            pl.col('load_in').minus(pl.col('load_out')).alias("load_removal"),
        )
    }

    let x = df["load_removal"].toArray().map(e=>[Math.log10(e)])
    let y =df["surface"].toArray().map(e=>[Math.log10(e)])

    let mlr = new MLR(x, y, {intercept: true})

    // if slope is negative, reject the model by setting rmae to infinity
    if (mlr.weights[0] <= 0) {
        mlr.rmae = Infinity
        return mlr
    }

    let prediction = mlr.predict(x).map(e=>Math.pow(10, e[0]))

    mlr.type = "power"
    mlr.rmae = calcRMAE(df, prediction)

    return mlr
}

const calcRMAE = function(df, prediction){
    df = df.withColumns(
        pl.Series(prediction).alias("prediction")
    ).withColumns(
        pl.col("prediction").minus(pl.col("surface")).pow(2).pow(0.5)
            .divideBy(pl.col("surface")).alias("relative_error")
    )
    return df["relative_error"].median()

}

module.exports = {
    trainRegressionModels
}






