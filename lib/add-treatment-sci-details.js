const {isKeyValueObject, validateDocumentInfo, isPositive, isDefined, isNotNegative, validatePollutants} = require("./utils");
const {getTokens, getUws, insertTreatmentSciDetails, readPublications,getUser} = require("./database");
const {readTechnologiesExcel} = require("./excel_utils");
const gl = require("./globals");

const addTreatmentSciDetails = async function(body){
    try
    {
        if(! body instanceof Object || !body)
        {
            return {
                success: false,
                error: 'Requested format is incorrect'
            };
        }
        else if(!body.user_data || !body.user_data.id)
        {
            return {
                success: false,
                error: 'Missing user data. Login to post your data.'
            };
        }

        let user = await getUser(body.user_data.id);

        if(!user.length)
        {
            return {
                success: false,
                error: 'User requested is incorrect. Login to post your data.'
            };
        }
        let publication = body.id_sci_publication ? await readPublications({id:body.id_sci_publication}) : [];

        if(!publication || !publication.length)
        {
            return {
                success: false,
                error: 'Publication not found'
            };
        }
        else
        {
            publication = publication[0];
        }

        if(publication.id_user !== body.user_data.id && publication.email !== user.email && user[0].role !== 'admin')
        {
            console.log('user',user);
            return {
                success: false,
                error: 'Forbidden access to that publication'
            };
        }

        const treatment = await validateTreatment(body);
        if (treatment.error)
        {
            return {
                success: false,
                message: treatment.error,
                error: treatment.error,
                details: treatment.details
            };
        }

        treatment.id_sci_publication = body.id_sci_publication;
        treatment.type = publication.type;
        treatment.sub_type = publication.sub_type;

        const treatment_result = await insertTreatmentSciDetails(treatment);
        if(!treatment_result.success)
        {
            return treatment_result;
        }

        return {
            success: true,
            message: treatment.id ? 'Treatment updated successfully' : 'Treatment added successfully'
        };
    }
    catch(error)
    {
        console.log('error',error);
        return {
            success: false,
            error: "Something went wrong"
        }
    }
}

async function validateTreatment(body) {
    try
    {
        let details = {};
        let error = {};
        if(body.id)
        {
            details.id = body.id;
        }
        // Utility function to validate if a field is positive and defined
        const validatePositiveNumber = (field, name) => {
            if (isDefined(body[field])) {
                if (!isPositive(body[field])) {
                    error[field] = `${name} field must be a positive number`;
                } else {
                    details[field] = Number(body[field]);
                }
            }
        };

        // Validate fields that must be positive numbers
        validatePositiveNumber('surface', 'Surface');
        validatePositiveNumber('hrt', 'Hrt');
        validatePositiveNumber('population', 'Population');
        validatePositiveNumber('inflow', 'Inflow');
        validatePositiveNumber('water_temp', 'Water temperature');

        // Year of operation, assuming 'doc.year' was a typo and meant 'body.year'
        if (isDefined(body.year)) {
            details.year = Number(body.year);
        }

        // Validate water type
        if (!Object.keys(gl.waterTypes).includes(body.water_type)) {
            error.water_type = `Water type must be one of the following: ${Object.keys(gl.waterTypes).join(", ")}`;
        } else {
            details.water_type = body.water_type;
        }

        // Validate urban water system
        if (isDefined(body.uws)) {
            let uwsTypes = await getUws();
            if (!uwsTypes.includes(body.uws)) {
                error.uws = `UrbanWaterSystem field must be one of the following: ${uwsTypes.join(", ")}`;
            } else {
                details.uws = body.uws;
            }
        }

        // Validate Air Temperature, adjusted based on the context provided
        if (isDefined(body.air_temp)) {
            details.air_temp = Number(body.air_temp);
            // Assuming you want to check if 'details.air_temp' is NaN after assignment
            if (isNaN(details.air_temp)) {
                error.air_temp = "Air temperature field must be a number";
            }
        }

        // Validate outflow
        if (body.outflow === '') body.outflow = null;
        if (isDefined(body.outflow)) {
            if (!isNotNegative(body.outflow)) {
                error.outflow = "Outflow field must be larger or equal to zero";
            }
            details.outflow = Number(body.outflow);
            if (isNaN(details.outflow)) {
                error.outflow = "Outflow field must be a number";
            }
        }

        // Validate outflow <= inflow
        if (isDefined(details.inflow) && isDefined(details.outflow)) {
            if (details.outflow > details.inflow) {
                error.outflow = "Outflow must be less than or equal to inflow";
            }
        }

        // Validate pollutants
        let pollutantErrors = validatePollutants(body.pollutants);

        if (Object.keys(pollutantErrors.error).length) {
            error = { ...error, ...pollutantErrors.error };
        }
        details.pollutants = body.pollutants;
        // Check if there are any error collected
        if (Object.keys(error).length > 0) {
            return { error: "Validation error", details: error };
        }
        // If no error, return the details
        return details;
    }
    catch(e)
    {
        console.log('error',e);
        return {
            error: "Something went wrong",
            success: false
        }
    }
}


module.exports = {
    addTreatmentSciDetails
}