// QUERY.JS //
/* ============================================================
Contains middleware which uses the Query Engine and Query Helpers to
contruct a full SQL statement. Queries the database, formats the
response object, and sends an HTTP response. 
============================================================ */

// Internal setup objects
const {returnableIDLookup, featureParents, setupObject} = require('../setup.js')

// Database connection and SQL formatter
const {postgresClient} = require('../db/pg.js');
// get connection object
const db = postgresClient.getConnection.db
// get SQL formatter
const formatSQL = postgresClient.format;

// Query Engine
const queryEngine = require('./queryEngine.js');

// Query Helpers
const queryHelpers = require('./queryHelpers.js');

// Lodash array for deep comparison
var lodashArray = require('lodash/array');
var lodashLang = require('lodash/lang');

// csv parser
const {writeToBuffer} = require('@fast-csv/format');


// Testing request response cycle time (for dev only)
var cycleTime = [];


/**
 * Takes in the requested returnables and the values to filter by. 
 * Then computes the joins needed to complete the join, generates a full SQL statement, and queries the database with the statement.
 * 
 * @param {object} req 
 * @param {object} res 
 * @param {function} next 
 */
function dataQueryWrapper(queryType) {

    return async (req, res, next) => {   
    
        try {
    
            let {
                allReturnableIDs,
                allIDs,
                feature,
                featureTree
            } = queryHelpers.makeInternalObjects(res.locals.parsed, queryType)
    
            // A lot happens here... The query engine contains an algorithm that trims unneeded joins, asigns aliases to arbitrary columns, stores a lookup of
            // aliases for the where clause, does some SQL formatting, and a bit more.
            let {
                selectClause,
                joinClauseArray,
                featureTreeArray,
                whereLookup
            } = queryEngine(allReturnableIDs, featureTree, feature, queryType);
                
            // Sanity Check: throw error if the length of the ID set is not equal to the sum of its partitions
            if(Object.keys(whereLookup).length != allIDs.length) {        
                return res.status(500).send('Internal Server Error 7701: Number of columns found different than number of columns requested')
            }
    
            const featureClauseArray = queryHelpers.makeFeatureClauseArray(feature, featureTreeArray, queryType);
    
            const whereClauseArray = queryHelpers.makeWhereClauseArray(whereLookup, res.locals.parsed.filters);
    
            const universalClauseArray = queryHelpers.makeUniversalFilters(whereLookup, res.locals.parsed.universalFilters, feature, queryType);
    
            const groupByClause = queryHelpers.makeGroupByClause(allReturnableIDs, feature, queryType);
    

            // EXECUTING QUERY
            // ==================================================
    
            // Adding clauses to query in order
            let query = [selectClause, ...featureClauseArray, ...joinClauseArray, ...whereClauseArray, groupByClause, ...universalClauseArray]; 
    
            // Concatenating clauses to make final SQL query
            let finalQuery = query.join(' '); 
            
            // DEBUG: Show SQL Query //
            // console.log(finalQuery); 
    
            // Finally querying the database and attaching the result
            res.locals.parsed.finalQuery = await db.result(finalQuery)
            // also attaching the returnableIDs 
            res.locals.parsed.finalReturnableIDs = allIDs.map(e => parseInt(e));
    
            // passing to the response handler
            next()
    
        } catch(err) {
    
            console.log(err)
            // Error
            return res.status(500).send(`Internal Server Error 1702: Malformed Query`);
            
        }
    }
}

// SEND OBSERVATION DATA
// ============================================================
function formatDefault(req, res, next) {
    // This is row-major data

    /* DEBUG */
    // console.log(res.locals.parsed.finalQuery);
    

    // fuck .fill(), all my homies hate .fill() 
    // (we don't use it here because it fills the array with references to a single array, instead of multiple arrays)
    let rowData = Array(res.locals.parsed.finalQuery.rows.length).fill().map(e => [])

    let primaryKey = Array(res.locals.parsed.finalQuery.rows.length).fill(null)

    
    let keys = res.locals.parsed.finalQuery.fields.map(field => field.name);
    let returnableIDs = keys.filter(key => key !== 'observation_pkey' && key !== 'item_pkey').map(key => parseInt(key.slice(1)));

    // fill the rows
    keys.forEach((key, i) => {
        
        // handle primary keys
        if(key === 'observation_pkey' || key === 'item_pkey') {
            res.locals.parsed.finalQuery.rows.forEach((row, ii) => {        
                primaryKey[ii] = row[key]
            })

        // if (list or special) and (array) then take distinct
        // This is because multiple many-to-manys duplicate the values in the other many-to-manys
        // kind of a hack but it works
        } else if(['obs-list', 'item-list', 'special'].includes(returnableIDLookup[returnableIDs[i-1]].referenceType) && res.locals.parsed.finalQuery.fields[i].dataTypeID == 1009) {
            res.locals.parsed.finalQuery.rows.forEach((row, ii) => {        
                rowData[ii].push([...new Set(row[key])]) 
            })

        } else {
            res.locals.parsed.finalQuery.rows.forEach((row, ii) => {        
                rowData[ii].push(row[key]) 
            })
        }  
    });

    // attach to formattedResponse
    res.locals.formattedResponse = {
        returnableIDs,
        rowData,
        primaryKey
    }

    next()

    
};

function sendDefault(req, res) {
    return res.json(res.locals.formattedResponse)
}


function sendDownload(req, res) {

    // first unpack formattedResponse
    let {
        returnableIDs,
        rowData,
        primaryKey
    } = res.locals.formattedResponse

    // get download type from url
    let { downloadType } = req.params;
    if(downloadType == 'csv') {
        // add header
        let csvData = [['Observation Primary Key', ...returnableIDs]]
        // format rows with primary keys
        rowData.forEach((row, i) => row.unshift(primaryKey[i]))
        // add rows to csv
        rowData.forEach(row => csvData.push(row))
        
        // write to buffer and send
        writeToBuffer(csvData).then(data => {
            res.writeHead(200, {
                'Content-Disposition': `attachment; filename="TDG-Download.csv"`,
                'Content-Type': 'text/csv',
            })

            res.end(data)
        })
    } else if(downloadType == 'json') {
        res.writeHead(200, {
            'Content-Disposition': `attachment; filename="TDG-Download.json"`,
            'Content-Type': 'application/json',
        })

        res.end(JSON.stringify({
            returnableIDs,
            rowData,
            primaryKey
        }))
    } else {
        res.status(400).send('Not a valid download type. Must be json or csv')
    }
}


// SEND DISTINCT OBSERVATION DATA
// ============================================================
function formatDistinct(req, res, next) {
    // This is column-major data

    let keys = res.locals.parsed.finalQuery.fields.map(field => field.name).filter(key => key !== 'observation_pkey' && key !== 'item_pkey');
    let returnableIDs = keys.map(key => parseInt(key.slice(1)));
    
    let columnData = Array(returnableIDs.length).fill().map(e => [])

    // fill the rows
    keys.forEach((key, i) => {
        
        // if (list or special) and (array) then take distinct
        // This is because multiple many-to-manys duplicate the values in the other many-to-manys
        // kind of a hack but it works
        if(['obs-list', 'item-list', 'special'].includes(returnableIDLookup[returnableIDs[i]].referenceType) && res.locals.parsed.finalQuery.fields[i+1].dataTypeID == 1009) {
            
            let allPossible = []
            res.locals.parsed.finalQuery.rows.forEach(row => {      
                allPossible = [...allPossible, ...row[key]]
            })
            columnData[i] = [...new Set(allPossible)]
            
        } else {
            res.locals.parsed.finalQuery.rows.forEach(row => {            
                columnData[i].push(row[key]) 
            })
        }
    });

    // take distinct
    // if output is an array we have to use lodash to take the unique arrays
    columnData = columnData.map((row, i) => {
        if(['obs-list', 'item-list', 'special'].includes(returnableIDLookup[returnableIDs[i]].referenceType) && res.locals.parsed.finalQuery.fields[i+1].dataTypeID == 1009) {
            return lodashArray.uniqWith(row, lodashLang.isEqual)
        } else {
            return [...new Set(row)]
        }
    })

    // attach to formattedResponse
    res.locals.formattedResponse = {
        returnableIDs,
        columnData
    }

    next()

}

function sendDistinct(req, res) {
    return res.json(res.locals.formattedResponse)
}

// SEND ID DATA
// ============================================================
function sendKey(req, res) {
    // query data is passed to the function via res.locals.parsed.finalQuery
    // finalQuery is one row

    /* DEBUG */
    // console.log(res.locals.parsed.finalQuery);

    let primaryKey = null

    if(res.locals.parsed.finalQuery.rows.length == 1) {
        let keys = res.locals.parsed.finalQuery.fields.map(field => field.name);
        keys.forEach((key) => {
        
            // handle primary keys
            if(key === 'observation_pkey' || key === 'item_pkey') {
                primaryKey = row[key]
            }
        });
    }

    return res.json({
        primaryKey
    });
}


// SEND STATS DATA
// ============================================================
async function statsQuery(req, res, next) {

    try { 

       //statsObservations
       //statsSubmitted
       //statsMostRecent
        
        let observations = await db.any('select max(observation_count_id) as obs from tdg_observation_count');  //maybe use a postgres var
        let submitted = await db.any('select max("s"."submission_id") as subs from item_submission as s');
        //let mostRecent = await db.one(statsMostRecent);

        let statsResponse = {
            observations: observations[0].obs,
            submitted: submitted[0].subs
        };

        return res.json(statsResponse);

    } catch(err) {

        console.log(err);
        res.status(500).send('Internal Server Error: 1703: Stats Query Error')

    }
    
}


// SEND SETUP OBJECT
// ============================================================
function sendSetup(req, res) {

    let cycleTime = Date.now() - res.locals.cycleTime[0]
    //console.log(`Sent setupObject in ${cycleTime} ms`)
    
    // if the "If-Modified-Since" header is not included or is newer or the same age as the setupObject's lastModified date
    if(res.locals.parsed.ifModifiedSince >= setupObject.lastModified) {

        return res.status(304) // don't send object - not modified
        
    } else { // then "If-Modified-Since" is older than setupObject's lastModified date or is something else

        // set "Last-Modified" header
        res.set('Last-Modified', setupObject.lastModified)
        // send setupObject
        return res.status(200).json(setupObject) // send setupObject
    };
};



module.exports = {
    featureQuery: dataQueryWrapper('observation'),
    itemQuery: dataQueryWrapper('item'),
    statsQuery,
    cycleTime,
    formatDefault,
    sendDefault,
    formatDistinct,
    sendDistinct,
    sendDownload,
    sendSetup,
    sendKey
};