const findNBS = require("../lib/find-nbs").findNBS
const expect = require("chai").expect
const jstat = require("jstat")


const avgKey = function(object, key){
    return object.reduce((total, next) => total + next[key], 0) / object.length
};

describe("Test /find-nbs", () => {
    describe('findNBS returns an array of technologies', () => {
       let result = findNBS({})
       it("result is an array", () => {
           expect(result).to.be.an('array')
       });
       it('technologies have id', () => {
           expect(result[1]).to.have.any.keys("id")
       });
    });
    describe("Raise error if some value is not correct", () => {
        it('waterType is not a string', () => {
            let result = findNBS({waterType: 123})
            expect(result).to.have.key("error")
        });
        it('waterType not accepted', () => {
            let result = findNBS({waterType: 'incorrect'})
            expect(result).to.have.key("error")
        });
        it("inflow is not a positive number", () => {
           let result = findNBS({inflow: -1})
            expect(result).to.have.key("error")
        });
        it("inhabitants is not a positive number", () => {
            expect(findNBS({inhabitants: "dds"})).to.have.key('error')
        });
        it("area is not a positive number", ()  => {
           expect(findNBS({area: 0})).to.have.key('error')
        });
        it("climate is not in the list", () => {
           expect(findNBS({climate: "mediterranean"})).to.have.key('error')
        });
        it('household is not boolean', () => {
            expect(findNBS({household: "true"})).to.have.key('error')
        });
        it('pollutants must be an array and in the list', () => {
           expect(findNBS({pollutants: 'c_removel'})).to.have.key('error')
           expect(findNBS({pollutants: ['c_removal', 'phosphours']})).to.have.key('error')
        });
        it('avgTemperature and climate do not match', () => {
           expect(findNBS({avgTemperature: -5, climate: 'tropical'})).to.have.key('error')
        });
        it('ecosystemServices is not an object or some key or value is not right', () => {
            expect(findNBS({ecosystemServices: true})).to.have.key('error')
            expect(findNBS({ecosystemServices: "a"})).to.have.key('error')
            expect(findNBS({ecosystemServices: 1})).to.have.key('error')
            expect(findNBS({ecosystemServices: {es_biodiversity: 2}})).to.have.key('error')
            expect(findNBS({ecosystemServices: {es_biodiversity_fauna: true}})).to.have.key('error')

        })
    });
    describe("Value conversions works properly", () => {
        it('climate is calculated if not provided', () => {
            let result = findNBS({avgTemperature: -4})
            result.forEach(tech => {
                expect(tech.m2_pe_continental).lt(1000000)
            });
        });
    });
    describe("Filters works properly", () => {
       it('waterType is filtered', () => {
            let waterType = 'raw_domestic_wastewater'
            let result = findNBS({waterType: waterType})
            result.forEach(tech => {
                expect(tech[waterType]).to.eql(1)
            })
       });
       it('household works only when true', () => {
           let result = findNBS({household: true})
           result.forEach(tech => {
               expect(tech.household_building_solutions).to.eql(1)
           });
           result = findNBS({household: false})
           // const average = females.reduce((total, next) => total + next.age, 0) / females.length;
           let avg = avgKey(result, 'household_building_solutions')
           expect(avg).gt(0)
           expect(avg).lt(1)
       });
       it('vertical filters properly', ()=>{
          let result = findNBS({vertical: false})
          expect(avgKey(result, 'vertical')).to.eql(0)
          result = findNBS({})
          let pattern = new RegExp('_GW$')
          result = result.filter(e => e.id.match(pattern))
          expect(result.length).gt(0)
       });
       it('pollutants filter properly', () => {
          let result = findNBS({pollutants: ['c_removal', 'n_removal_nitrification']})
          expect(avgKey(result, 'c_removal')).to.eql(1)
          expect(avgKey(result, 'n_removal_nitrification')).to.eql(1)
          expect(avgKey(result, 'p_removal')).lt(1)
       });
       it('both surfaces filter properly', () => {
           let inflow = 1000
           let result = findNBS({inflow: inflow, waterType: 'greywater'})
           let area = result.filter(a => a.surface_low > 0).map(a => a.surface_low);
           let median_area = jstat.median(area)
           let vertical_area = result.filter(a => a.vertical_surface_low > 0).map(a => a.vertical_surface_low)
           let median_vert_area = jstat.median(vertical_area)
           let resultArea = findNBS({inflow: inflow, waterType: 'greywater', area: median_area, verticalArea: median_vert_area})
           resultArea.forEach(tech => {
               expect(tech.surface_low).to.lte(median_area)
               expect(tech.vertical_surface_low).to.lte(median_vert_area)
           })
       });
       it('when area is almost 0 only green walls should be returned', () => {
           let result = findNBS({inflow: 1000, area: 0.00001});
           result.forEach(tech => {
               expect(tech.vertical).to.eq(1)
           });
       });
        it('when verticalArea is almost 0 only green walls should be returned', () => {
            let result = findNBS({inflow: 1000, verticalArea: 0.00001});
            result.forEach(tech => {
                expect(tech.vertical).to.eq(0)
            });
        });
        it('ecosystemServices filters properly', () => {
            let result = findNBS({ecosystemServices: {es_biodiversity_fauna: 2, es_recreation: 3, es_biosolids: 0}})
            result.forEach(tech => {
                expect(tech.es_biodiversity_fauna).to.gte(2)
                expect(tech.es_recreation).to.gte(3)
            })
            expect(result.filter(e => e.es_biosolids === 0)).to.have.length.gt(0)
        })
    });
    describe("Estimation of surface", () => {
       it('confidence is estimated', () => {
           let result = findNBS({"inhabitants": 200})
           result.forEach(tech => {
               expect(tech).to.have.any.keys("surface_mean")
               expect(tech).to.have.any.keys("surface_low")
               expect(tech).to.have.any.keys("surface_high")
           });
       });
       it('larger inflow return larger surface', () => {
          let low = findNBS({"inflow": 1000})
          let high = findNBS({"inflow": 10000})
           for (let i = 0; i < low.length; i++) {
               if (low[i].vertical === 0 && low[i].m2_pe_temperate < 100000)
                  expect(low[i].surface_mean).lt(high[i].surface_mean)
               if (low[i].vertical === 1 && low[i].m2_pe_temperate < 100000)
                   expect(low[i].vertical_surface_mean).lt(high[i].vertical_surface_mean)
           }
       });
    });
});