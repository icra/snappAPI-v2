const findNBS = require("../lib/find-nbs").findNBS
const avgKey = require("../lib/utils").avgKey
const chai = require("chai")
const expect = require("chai").expect
const jstat = require("jstat")
const chaiAlmost = require('chai-almost');
const {waterTypes} = require("../lib/globals");
const {readTechnologiesExcel} = require("../lib/excel_utils");
chai.use(chaiAlmost(0.0001));

describe("Test /find-nbs", () => {
    describe('findNBS returns an array of treatment technologies', async () => {
       let result = await findNBS({})
       it("result is an array", () => {
           expect(result).to.be.an('array')
       });
       it('technologies have id', () => {
           expect(result[1]).to.have.any.keys("id")
       });
       it('default options return treatment technologies', () => {
           result.map(e => expect(e.module).eq("treatment"))
       })
    });
    describe("Raise error if some value is not correct", async () => {
        it('not accepted fields in body raise an error', async () => {
            let result = await findNBS({incorrect: 123})
            expect(result).to.have.key("error")
        });
        it('waterType is not a string', async () => {
            let result = await findNBS({waterType: 123})
            expect(result).to.have.key("error")
        });
        it('waterType not accepted', async () => {
            let result = await findNBS({waterType: 'incorrect'})
            expect(result).to.have.key("error")
        });
        it("inflow is not a positive number", async () => {
           let result = await findNBS({inflow: -1})
            expect(result).to.have.key("error")
        });
        it("inhabitants is not a positive number", async () => {
            expect(await findNBS({inhabitants: "dds"})).to.have.key('error')
        });
        it("area is not a positive number", async ()  => {
           expect(await findNBS({area: 0})).to.have.key('error')
        });
        it("verticalArea is not a positive number", async ()  => {
            expect(await findNBS({verticalArea: -2})).to.have.key('error')
        });
        it("rain volume is not a positive number", async ()  => {
            expect(await findNBS({waterType: "rain_water", cumRain: -2, duration: 1, catchmentArea: 30})).to.have.key('error')
            expect(await findNBS({waterType: "rain_water", cumRain: 100, duration: -1, catchmentArea: 30})).to.have.key('error')
            expect(await findNBS({waterType: "rain_water", cumRain: 100, duration: 1, catchmentArea: -30})).to.have.key('error')
        });
        it("drainagePipeDiameter is not a positive number", async ()  => {
            expect(await findNBS({
                waterType: "rain_water",
                cumRain: 100,
                duration: 1,
                catchmentArea: 30,
                drainagePipeDiameter: -1
            })).to.have.key('error')
        });
        it("soil infiltration rate is not a positive number", async ()  => {
            expect(await findNBS({
                waterType: "rain_water",
                cumRain: 100,
                duration: 1,
                catchmentArea: 30,
                infiltration: -1
            })).to.have.key('error')
        });
        it("climate is not in the list", async () => {
           expect(await findNBS({inflow: 1000, climate: "mediterranean"})).to.have.key('error')
        });
        it('household is not boolean', async () => {
            expect(await findNBS({household: "true"})).to.have.key('error')
        });
        it('pollutants must be an array and in the list', async () => {
           expect(await findNBS({pollutants: 'c_removal'})).to.have.key('error')
           expect(await findNBS({pollutants: ['c_removal', 'phosphours']})).to.have.key('error')
        });
        it('pollutantsConcentrations must be an object', async () => {
            expect(await findNBS({pollutantsConcentrations: ['bod_in',10, 'bod_out', 20]})).to.have.key('error')
        });
        it('pollutantsConcentrations must have the right keys', async () => {
           expect(await findNBS({pollutantsConcentrations: {c_in: 10, c_out: 20}})).to.have.any.key('error')
        });
        it('Return error if out is provided but not in for pollutant concentration', async () => {
            expect(await findNBS({pollutantsConcentrations: {bod_in: 10, cod_out: 20}})).to.have.any.key('error')
        });
        it('Return error if in is provided but not out for pollutant concentration', async () => {
            expect(await findNBS({pollutantsConcentrations: {cod_in: 10}})).to.have.any.key('error')
        });
        it('avgTemperature and climate do not match', async () => {
           expect(await findNBS({inflow: 100, avgTemperature: -5, climate: 'tropical'})).to.have.key('error')
        });
        it('ecosystemServices is not an object or some key or value is not right', async () => {
            expect(await findNBS({ecosystemServices: true})).to.have.key('error')
            expect(await findNBS({ecosystemServices: "a"})).to.have.key('error')
            expect(await findNBS({ecosystemServices: 1})).to.have.key('error')
            expect(await findNBS({ecosystemServices: {es_biodiversity: 2}})).to.have.key('error')
            expect(await findNBS({ecosystemServices: {es_biodiversity_fauna: true}})).to.have.key('error')
        })
        it('energy must be yes or no', async ()=> {
            expect(await findNBS({energy: true})).to.have.key('error')
            expect(await findNBS({energy: "a"})).to.have.key('error')
            expect(await findNBS({energy: 1})).to.have.key('error')
            expect(await findNBS({energy: ['yes', 'no']})).to.have.key('error')
        })
        it('all technologies are rejected when filtering', async () => {
            let result = await findNBS({waterType: "cso_discharge_water", ecosystemServices: {es_carbon_sequestration: 3}})
            expect(result).to.have.key('error')
        });
    });
    describe("Value conversions works properly", async () => {
        it('climate is calculated if not provided', async () => {
            let result = await findNBS({inflow: 100, avgTemperature: -4})
            result.forEach(tech => {
                expect(tech.m2_pe_continental).lt(1000000)
            });
        });
    });
    describe("Filters works properly", async () => {
       it('all types of water returns some technology', async () => {
         for (wt of Object.keys(waterTypes)){
             let result = await findNBS({waterType: wt})
             expect(result[0]).to.have.any.key('id')
         }
       });
       it("bod_removal and bod_in return some technology", async () => {
          let result = await findNBS({
                  waterType: 'greywater',
                  inflow: 1000,
                  pollutants: [ 'bod_removal' ],
                  pollutantsConcentrations: { bod_in: 100 }
              }
          )
       });
       it("minPerformance filters only if concentrations are not provided", async () => {
            let result = await findNBS({
                    inflow: 1000,
                    pollutants: [ 'bod_removal', 'cod_removal'],
                    minPerformance: {bod: 99, nh4: 95},
                    pollutantsConcentrations: {tn_in: 100, tn_out: 40}
                }
            )
            result.map(e => expect(e.bod_removal).gte(99))
            result.map(e => expect(e.cod_removal).gte(80))
            result.map(e => expect(e.tn_removal).gte(60))
            result.map(e => expect(e.nh4_removal).gte(95))
            expect(result.filter(e => e.no3_removal === 0).length).gt(0)
            expect(result.filter(e => e.no3_removal === 1).length).gt(0)
        });
       it('techIds returns correspondent ids', async () => {
           let result = await findNBS({techIds: ["TR_TR", "DB_DB"], waterType: "rain_water"})
           expect(result.length).eql(2)
           result.map(e => expect(e.id).to.be.oneOf(["TR_TR", "DB_DB"]))
       })
       it('techIds goes through the filters', async () => {
              let result = await findNBS({techIds: ["FP_PL", "French_CW"], avgTemperature: -4})
              expect(result.length).eql(1)
              expect(result[0].id).eq("French_CW")
       })
       it('waterType is filtered', async () => {
            let waterType = 'raw_domestic_wastewater'
            let result = await findNBS({waterType: waterType})
            result.forEach(tech => {
                expect(tech['raw_domestic_wastewater']).to.eql(1)
            });

            waterType = 'rain_water'
            result = await findNBS({waterType: waterType})
            result.forEach(tech => {
               expect(tech['module']).to.eql("swm")
            });
       });
       it('continental climate filters', async () => {
           let result1 = await findNBS({climate: 'continental'})
           result1.map(e => expect(e.m2_pe_continental).lt(100000))
           let result2 = await findNBS({avgTemperature: -5})
           result2.map(e => expect(e.m2_pe_continental).lt(100000))
       });
       it('household works only when true', async () => {
           let result = await findNBS({household: true})
           result.forEach(tech => {
               expect(tech.household_building_solutions).to.eql(1)
           });
           result = await findNBS({household: false})
           // const average = females.reduce((total, next) => total + next.age, 0) / females.length;
           let avg = avgKey(result, 'household_building_solutions')
           expect(avg).gt(0)
           expect(avg).lt(1)
       });
       it('vertical filters properly', async ()=>{
          let result = await findNBS({vertical: false})
          expect(avgKey(result, 'vertical')).to.eql(0)
          result = await findNBS({})
          let pattern = new RegExp('_GW$')
          result = result.filter(e => e.id.match(pattern))
          expect(result.length).gt(0)
       });
       it('pollutants filter properly', async () => {
          let result = await findNBS({pollutants: ['bod_removal', 'pathogens_reduction']})
          result.map(e => expect(e.bod_removal).gte(80))
          expect(avgKey(result, 'tn_removal')).to.lt(80)
          expect(avgKey(result, 'pathogens_reduction')).to.eql(1)
          expect(avgKey(result, 'p_removal')).lt(1)
       });
       it('pollutants filter based on performance', async () => {
          let result = await findNBS({pollutants: ['cod_removal', 'tn_removal'], pollutantsConcentrations: {bod_in: 60, cod_in: 100, cod_out: 10}})
          result.map(e => expect(e.cod_removal).gte(90))
          result.map(e => expect(e.tn_removal).gte(80))
          result.map(e => expect(e.bod_removal).gte(80))
          expect(result.filter(e => e.nh4_removal < 80).length).gt(0)
       });
       it('both surfaces filter properly', async () => {
           let inflow = 1000
           let result = await findNBS({inflow: inflow, waterType: 'greywater'})
           let area = result.filter(a => a.surface_low > 0).map(a => a.surface_low);
           let median_area = jstat.median(area)
           let vertical_area = result.filter(a => a.vertical_surface_low > 0).map(a => a.vertical_surface_low)
           let median_vert_area = jstat.median(vertical_area)
           let resultArea = await findNBS({inflow: inflow, waterType: 'greywater', area: median_area, verticalArea: median_vert_area})
           resultArea.forEach(tech => {
               expect(tech.surface_low).to.lte(median_area)
               expect(tech.vertical_surface_low).to.lte(median_vert_area)
           })
       });
       it('when area is almost 0 only green walls should be returned', async () => {
           let result = await findNBS({inflow: 1000, area: 0.00001});
           expect(avgKey(result, 'vertical')).to.eq(1)
       });
       it('when verticalArea is almost 0 no green walls should be returned', async () => {
            let result = await findNBS({inflow: 1000, verticalArea: 0.00001});
            expect(avgKey(result, 'vertical')).to.eq(0)
        });
       it('ecosystemServices filters properly', async () => {
            let result = await findNBS({ecosystemServices: {es_biodiversity_fauna: 2, es_recreation: 3, es_biosolids: 0}})
            result.forEach(tech => {
                expect(tech.es_biodiversity_fauna).to.gte(2)
                expect(tech.es_recreation).to.gte(3)
            })
            expect(result.filter(e => e.es_biosolids === 0)).to.have.length.gt(0)
        });
       it('energy filters properly', async () => {
            let result = await findNBS({energy: 'no'})
            expect(avgKey(result, 'energy')).to.eq(0)
            result = await findNBS({energy: 'yes'})
            expect(avgKey(result, 'energy')).to.eq(1)
        });
       it('manPower filters properly', async () => {
            let result = await findNBS({manPower: 2})
            expect(result.filter(e=> e.inv_es_manpower > 2).length).to.eq(0)
            expect(result.filter(e=> e.inv_es_manpower < 2).length).to.gt(0)
        });
       it('skills filters properly', async () => {
            let result = await findNBS({skills: 2})
            expect(result.filter(e=> e.inv_es_skills > 2).length).to.eq(0)
            expect(result.filter(e=> e.inv_es_skills < 2).length).to.gt(0)
        });
       it('biohazardrisk filters properly', async () => {
            let result = await findNBS({biohazardRisk: 2})
            expect(result.filter(e=> e.inv_es_biohazard > 2).length).to.eq(0)
            expect(result.filter(e=> e.inv_es_biohazard < 2).length).to.gt(0)
        });
       it('onlyInfiltration filters properly', async () => {
            let result = await findNBS({onlyInfiltration: true, waterType: 'rain_water'})
            result.map(e => expect(e.infiltration).to.eq(1))
            let result2 = await findNBS({onlyInfiltration: true, waterType: 'runoff_water', cumRain: 100, duration: 24, catchmentArea: 1000})
            result2.map(e => expect(e.infiltration).to.eq(1))
            result2.map(e => expect(e).to.have.any.key('surface_mean'))
        })
       it('when infiltration and drainage Pipe are not provided, and surface is calculated, technologies with sc == 0 are rejected', async () => {
            let result = await findNBS({waterType: "rain_water"})
            expect(result.some(e => e.storage_capacity_low === 0)).to.be.true
            let result2 = await findNBS({waterType: "rain_water", cumRain: 100, duration: 24, catchmentArea: 1000})
            expect(result2.some(e => e.storage_capacity_low === 0)).to.be.false
            let result3 = await findNBS({waterType: "rain_water", cumRain: 100, duration: 24, catchmentArea: 1000, drainagePipeDiameter: 0.1})
            expect(result3.some(e => e.storage_capacity_low === 0)).to.be.true
        });
       it('when infiltrationSoils is provided, infiltration is calculated', async () => {
            let result = await findNBS({waterType: "rain_water", cumRain: 100, duration: 24, catchmentArea: 1000, infiltrationSoils: "sand"})
            expect(result.some(e => e.storage_capacity_low === 0)).to.be.true
        })
    });
    describe("Estimation of surface", async () => {
       it('confidence is estimated', async () => {
           let result = await findNBS({"inhabitants": 200})
           result.forEach(tech => {
               expect(tech).to.have.any.keys("surface_mean")
               expect(tech).to.have.any.keys("surface_low")
               expect(tech).to.have.any.keys("surface_high")
               expect(tech).to.have.any.keys("vertical_surface_mean")
               expect(tech).to.have.any.keys("vertical_surface_low")
               expect(tech).to.have.any.keys("vertical_surface_high")
           });
       });
       it('larger inflow return larger surface', async () => {
          let low = await findNBS({waterType: "raw_domestic_wasterwater", "inflow": 1000})
          let high = await findNBS({waterType: "raw_domestic_wasterwater", "inflow": 10000})
           for (let i = 0; i < low.length; i++) {
               if (low[i].vertical === 0 && low[i].m2_pe_temperate < 100000)
                  expect(low[i].surface_mean).lt(high[i].surface_mean)
               if (low[i].vertical === 1 && low[i].m2_pe_temperate < 100000)
                   expect(low[i].vertical_surface_mean).lt(high[i].vertical_surface_mean)
           }
       });
       // There is no technology using linear model right now
//       it('linear model coincides with R results', async ()=> {
//           let result = await findNBS({techIds: ["French_CW"], inflow: 50, pollutantsConcentrations: {tn_in: 80, tn_out: 30}})
//           expect(result[0].surface_method).to.eq("linear_regression")
//           expect(result[0].surface_mean).to.be.within(650, 655)
//           expect(result[0].surface_low).to.be.within(575, 580)
//           expect(result[0].surface_high).to.be.within(725, 730)
//       });
        // Exponential models are under review
//         it('exponential model coincides with R results', async ()=> {
//             let result = await findNBS({techIds: ["HF_GW"], inflow: 100000, pollutantsConcentrations: {no3_in: 6, no3_out: 2}})
//             expect(result[0].surface_method).to.eq("exponential_regression")
//             expect(result[0].surface_mean).to.be.within(38000, 43000)
//             expect(result[0].surface_low).to.be.within(0, 25000)
//             expect(result[0].surface_high).to.be.within(60000, 90000)
//         });
        it('power model coincides with R results', async ()=> {
            let result = await findNBS({techIds: ["FP_PL"], inflow: 1000000,
                pollutantsConcentrations: {bod_in: 300, bod_out: 100, cod_in: 371, cod_out: 249}})
            expect(result[0].surface_method).to.eq("power_regression")
            expect(result[0].surface_mean).to.be.within(6000, 6200)
            expect(result[0].surface_low).to.be.within(3000, 4500)
            expect(result[0].surface_high).to.be.within(8000, 11000)
        });
        it('tis model is used when horizontal flow wetlands or green walls are used', async() => {
            let result = await findNBS({techIds: [ "HF_GW", "HSSF_CW"], inflow: 500, pollutantsConcentrations: {tn_in: 20, tn_out: 5}})
            expect(result.every(e => e.surface_method === "tis_model")).to.be.true
            expect(result[0].vertical_surface_mean).gt(0)
            expect(result[1].surface_mean).gt(0)
        });
        it('cascade model continues when some pollutants are not estimated by regression', async() => {
           let result = await findNBS({techIds: ["HF_GW"], inflow: 0.08, pollutantsConcentrations: {
               bod_in: 300, bod_out: 100,
               cod_in: 400, cod_out: 150,
               tn_in: 3, tn_out: 2}})
           expect(result[0].surface_method).to.eq("tis_model")
        });
        it('uses organic load ratio when only bod_in is provided', async () => {
            let result = await findNBS({techIds: ["French_CW"], inflow: 0.5, pollutantsConcentrations: {bod_in: 80}});
            expect(result[0].surface_method).to.eq("organic_loading_rate")
            expect(result[0].surface_mean).to.be.within(1.33, 1.34)
            expect(result[0].surface_low).to.be.within(1.00, 1.01)
            expect(result[0].surface_high).to.be.within(1.66, 1.67)
        });
        it('uses organic load ratio data is out of range', async () => {
            let result = await findNBS({techIds: ["French_CW"], inflow: 5, pollutantsConcentrations: {bod_in: 80, bod_out: 20}});
            expect(result[0].surface_method).to.eq("organic_loading_rate")
            expect(result[0].surface_mean).to.be.within(13.333, 13.334)
            expect(result[0].surface_low).to.be.within(10.000, 10.001)
            expect(result[0].surface_high).to.be.within(16.666, 16.667)
        });
        it('uses m2_pe when only people equivalent is provided', async () => {
            let result = await findNBS({techIds: ["French_CW"], inflow: 0.05});
            expect(result[0].surface_method).to.eq("ratio_m2_pe")
            expect(result[0].surface_mean).to.be.within(0.8, 0.9)
            expect(result[0].surface_low).to.be.within(0.6, 0.7)
            expect(result[0].surface_high).to.be.within(1.04, 1.05)
        });
        it('when infiltration is not defined, all technologies with phi or hc == 0 are rejected', async () => {
           let result = await findNBS({waterType: "rain_water", cumRain: 100, duration: 24, catchmentArea: 1000})
              result.map(e => expect(e.storage_capacity_low).gt(0))
              result.map(e => expect(e.hc_low).gt(0))
        });
       it('larger infiltration returns smaller surface', async () => {
           let low = await findNBS({waterType: "rain_water", cumRain: 100, duration: 24, catchmentArea: 1000, infiltration: 10})
           let high = await findNBS({waterType: "rain_water", cumRain: 100, duration: 24, catchmentArea: 1000, infiltration: 1})
           for (let i = 0; i < low.length; i++) {
               if (low[i].infiltration === 1) {
                   expect(low[i].surface_mean).lt(high[i].surface_mean)
               }
               else if (low[i].infiltration === 0) {
                   expect(low[i].surface_mean).eq(high[i].surface_mean)
               }
           }
       });
       it('spilledVolume and rainCum * catchmentArea give the same result', async () => {
           let result1 = await findNBS({waterType: "rain_water", cumRain: 100, duration: 24, catchmentArea: 2000})
           let result2 = await findNBS({waterType: "rain_water", spilledVolume: 200, duration: 24})
           for (let i = 0; i < result1.length; i++) {
              expect(result1[i].surface_mean).eq(result2[i].surface_mean)
          }
       });
        it('larger drainage pipe diameter returns smaller surface', async () => {
            let low = await findNBS({waterType: "rain_water", cumRain: 100, duration: 24, catchmentArea: 1000, drainagePipeDiameter: 0.1})
            let high = await findNBS({waterType: "rain_water", cumRain: 100, duration: 24, catchmentArea: 1000, drainagePipeDiameter: 0.01})
            for (let i = 0; i < low.length; i++) {
                expect(low[i].surface_mean).lt(high[i].surface_mean)
            }
        });
       it('daily volume is properly estimated', async () => {
          let result = await findNBS({waterType: "runoff_water", cumRain: 200, duration: 24, catchmentArea: 1000, area: 1000})
           // check that there are true and false values in result[i].enough_area
           expect(result.filter(e => e.enough_area === true).length).to.gt(0)
           expect(result.filter(e => e.enough_area === false).length).to.gt(0)

          result.filter(e => e.enough_area === true).map(e => expect(e.max_volume).to.almost.equal(200))
          result.filter(e => e.enough_area === true).map(e => expect(e.surface_high).lte(1000))
          result.filter(e => e.enough_area === false).map(e => expect(e.max_volume).lt(200))
          result.filter(e => e.enough_area === false).map(e => expect(e.surface_mean).gt(1000))
       });
       it('when area is not provided, daily_volume always equal to volume', async () => {
           let result = await findNBS({waterType: "runoff_water", cumRain: 200, duration: 24, catchmentArea: 1000})
           result.map(e => expect(e.max_volume).to.almost.equal(200))
       });
       it('CSO surface is calculated properly', async () => {
           let result = await findNBS({waterType: "cso_discharge_water", spilledVolume: 1000})
           result.map(e => expect(e.surface_mean).to.gt(e.surface_low))
           result.map(e => expect(e.surface_mean).to.lt(e.surface_high))
           result.map(e => expect(e.surface_low).to.almost.equal(1000 / e.hlr_m3_m2_year_high))
           result.map(e => expect(e.surface_high).to.almost.equal(1000 / e.hlr_m3_m2_year_low))
           // console.log(result)
       })
    });
    describe("Filter table works properly", async () => {
        it("Filter table is returned when asked", async () => {
            let result = await findNBS({waterType: "cso_discharge_water", filterTable: true})
            expect(result.length).to.be.eq(readTechnologiesExcel().length)
            result.map(e => expect(e).to.have.any.keys("name"))
            expect(result.filter(e => e.water_type === true).length).to.gt(0)
            expect(result.filter(e => e.water_type === false).length).to.gt(0)
        });
        it(" Filter table is returned also when no technologies are returned", async () => {
            let result = await findNBS({
                waterType: "cso_discharge_water",
                ecosystemServices: {es_carbon_sequestration: 3},
                filterTable: true})
            expect(result.length).to.be.eq(readTechnologiesExcel().length)
            result.map(e => expect(e.water_type === false || e.es_carbon_sequestration === false).to.be.true)
        })
    })
});