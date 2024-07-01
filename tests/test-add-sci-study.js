const {expect} = require("chai")
const {addTreatmentSciDetails} = require("../lib/add-treatment-sci-details");
const {deleteSciStudyDB, closeDB, readSciStudies} = require("../lib/database");
const {parseDoi} = require("../lib/utils");
const dotenv = require('dotenv')
dotenv.config()

const username = process.env.TOKEN_USERNAME
const token = process.env.TOKEN_FRONTEND

let body = {
    //User data is set in the auth middleware
    user_data: {
        id: 19
        //email: 'crous.mayne@gmail.com',
        //role: 'admin'
    },
    id_sci_publication: 2346,
    surface: 0,
    hrt: 0,
    population: 0,

    //water attributes
    water_type: 'any_wastewater',
    uws: 'WWTP',
    water_temp: -1,
    air_temp: -1,
    inflow: -1,

    pollutants: {
        //inflow
        bod_in: -1,
        tn_in: -1,
        cod_in: -1,
        no3_in: -1,
        nh4_in: -1,
        tp_in: -1,
        po43_in: -1,
        ecoli_in: -1,
        heggs_in: -1,

        //out
        bod_out: -1,
        tn_out: -1,
        cod_out: -1,
        no3_out: -1,
        nh4_out: -1,
        tp_out: -1,
        po43_out: -1,
        ecoli_out: -1,
        heggs_out: -1
    }
};

describe('Test /add-sci-study', ()=> {
    describe('Sanity checks', () => {
        it('Returns error when body is not an object', async () => {
            let result = await addTreatmentSciDetails(null)
            expect(result).to.have.keys(['error', 'success']);
        });

        it('Returns error when user data is not correct', async () => {
            let result = await addTreatmentSciDetails({})
            expect(result).to.have.keys(['error', 'success']);
        });

        it('Returns error user data is not correct', async () => {
            let result = await addTreatmentSciDetails(body);
            expect(result).to.have.keys(['error', 'success']);
        });

        it('Returns errors when outflow > inflow', async () => {
            body.inflow = 100
            body.outflow = 101
            let result = await addTreatmentSciDetails(body)
            expect(result).to.have.keys(['error', 'success']);
        });
    });
    // describe('Insert case study', () => {
    //     it('Insert case study', async () => {
    //         let result = await addTreatmentSciDetails(body)
    //         expect(result).eq('Case study inserted')
    //         let inserted = await readSciStudies(status = 'pending')
    //         inserted = inserted.filter(s => s.username === body.username)
    //         expect(inserted.length).eq(1)
    //         expect(inserted[0].po43_in).eq(43)
    //         expect(inserted[0].no3_out).eq(2)
    //         expect(inserted[0].tn_in).eq(null)
    //         expect(inserted[0].type).eq("GW")
    //         expect(inserted[0].year_operation).eq(2020)
    //         let document = JSON.parse(inserted[0].doc_data)
    //         expect(document.title).eq(body.document.title)
    //     });
    //     it('Remove test insertion', async () => {
    //         let result = await deleteSciStudyDB('username', 'jospueyo')
    //         expect(result).eq('Case studies deleted')
    //         let inserted = await readSciStudies()
    //         inserted = inserted.filter(s => s.username === body.username)
    //         expect(inserted.length).eq(0)
    //     })
    // });
})
