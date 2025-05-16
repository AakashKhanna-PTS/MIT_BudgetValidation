/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(["SuiteScripts/pts_helper", "N/query", "N/record", "N/search", "N/format", "N/runtime"],
    function (util, query, record, search, format, runtime) {
        function validateLine(context) {

            console.log('validateLine triggered', 'validateLine_1727');
            var currentRecord = context.currentRecord;
            var sublistField = context.sublistId;

            try {
                //log.debug('context',context);
                var recordType = currentRecord.type;
                log.debug('recordType', recordType);

                var getSub = currentRecord.getValue({ fieldId: 'subsidiary' });
                log.debug('getSub', getSub);

                var getRecCurrency = currentRecord.getValue({ fieldId: 'currency' });
                log.debug('getRecCurrency', getRecCurrency);

                var getDate = currentRecord.getValue({ fieldId: 'trandate' });
                log.debug('getDate', getDate);

                var getReceiveDate = currentRecord.getValue({ fieldId: 'duedate' }); // Receive date for PO
                log.debug('getReceiveDate', getReceiveDate);


                var orderDate = new Date(getReceiveDate);
                var financialYear = getFinancialYear(orderDate);

                log.debug('The financial year is:', financialYear);

                var splitFY = financialYear.split('-');
                log.debug('splitFY', splitFY)

                var firstDayOfYear = '04/01/' + splitFY[0];
                var lastDayOfYear = '03/31/' + splitFY[1];

                 
                if (sublistField == 'item') {

                    var uniqueAccountArray = []; var uniqeGetClassArray = []; var uniqeGetDepartment = []; var uniqeGetlocationArray = [];

                    var getLocation = currentRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_pts_mit_budgetlocation'}); //location
                    console.log('getLocation', getLocation);
                    uniqeGetlocationArray.push(getLocation);

                    var getDepartment = currentRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'department' }); //Business Unit
                    console.log('getDepartment', getDepartment);
                    uniqeGetDepartment.push(getDepartment);

                    var getClass = currentRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'class' }); //Business Unit
                    console.log('getClass', getClass);
                    uniqeGetClassArray.push(getClass);

                    var getItem = currentRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' });
                    console.log('getItem', getItem);

                    var itemType = currentRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'itemtype' });
                    //console.log('itemType', itemType);
                    console.log('itemType', itemType);

                    var searField = search.lookupFields({
                        type: search.Type.ITEM,
                        id: getItem,
                        columns: ['expenseaccount', 'assetaccount', 'custitem_item_ac_hierarchy']
                    });
                    log.debug('searField', searField);

                    if (itemType == 'InvtPart' || itemType == 'Assembly') {
                        var getAccount = searField.assetaccount[0].value;
                        var getAcHierarchy = searField.custitem_item_ac_hierarchy;
                        log.debug('getAccount', getAccount);
                        log.debug('getAcHierarchy', getAcHierarchy);

                    } else if (itemType == 'NonInvtPart' || itemType == 'OthCharge' || itemType == 'Service') {
                        var getAccount = searField.expenseaccount[0].value;
                        var getAcHierarchy = searField.custitem_item_ac_hierarchy;
                        log.debug('getAccount', getAccount);
                        log.debug('getAcHierarchy', getAcHierarchy);
                    }
                    //var AcHierarcyArray = getAcHierarchy.split(/\u0005/)
                    //log.debug('AcHierarcyArray', AcHierarcyArray);

                    log.debug('uniqeGetClassArray', uniqeGetClassArray);
                    log.debug('uniqeGetDepartment', uniqeGetDepartment);
                    log.debug('uniqeGetlocationArray', uniqeGetlocationArray);
                   
                    uniqueAccountArray.push(getAccount);
                    log.debug('uniqueAccountArray',uniqueAccountArray);

                    var bdgtAcGroup = findGroup(uniqueAccountArray);
                    log.debug('bdgtAcGroup',bdgtAcGroup);

                    if(_logValidation(bdgtAcGroup))
                    {
                        var resultObj = findBudget(bdgtAcGroup, financialYear, uniqeGetClassArray,uniqeGetDepartment, uniqeGetlocationArray);
                        log.debug("Mapped Results", resultObj);
                        log.debug("Mapped Results length", resultObj.length);
                    }else{
                        alert( "Please Create Budget Acount Group for this item or contact administrator");
                        return false ;
                    }
                    
                    if (resultObj.length > 0) {

                        var priorityList = [];

                        //for (var pl = 0; pl < AcHierarcyArray.length; pl++) {
                            //[{"id":17,"custrecord_pts_mit_bdgt_ac":52,"custrecord_pts_mit_bdgt_class":404,"custrecord_pts_mit_costcenter":2,"custrecord_pts_mit_bdgt_location":3,"custrecord_pts_mit_bdgt_amt":500000}]
                            var pl_acdl = { "custrecord_pts_mit_bdgtaccgeup": Number(bdgtAcGroup), "custrecord_pts_mit_bdgt_class": Number(getClass), "custrecord_pts_mit_costcenter": Number(getDepartment), "custrecord_pts_mit_bdgt_location": Number(getLocation)}
                            var pl_acd  = { "custrecord_pts_mit_bdgtaccgeup": Number(bdgtAcGroup), "custrecord_pts_mit_bdgt_class": Number(getClass), "custrecord_pts_mit_costcenter": Number(getDepartment), "custrecord_pts_mit_bdgt_location": null}
                            var pl_acl =  { "custrecord_pts_mit_bdgtaccgeup": Number(bdgtAcGroup), "custrecord_pts_mit_bdgt_class": Number(getClass), "custrecord_pts_mit_costcenter": null, "custrecord_pts_mit_bdgt_location": Number(getLocation) }
                            var pl_ac =   { "custrecord_pts_mit_bdgtaccgeup": Number(bdgtAcGroup), "custrecord_pts_mit_bdgt_class": Number(getClass), "custrecord_pts_mit_costcenter": null, "custrecord_pts_mit_bdgt_location": null }
                            
                            priorityList.push(pl_acdl);
                            priorityList.push(pl_acd);
                            priorityList.push(pl_acl);
                            priorityList.push(pl_ac);

                        //}
                        log.debug('priorityList', priorityList);

                        var budgetTotal = null;
                        var applicableLine;
                        var budgetID;
    
                        for (let criteria of priorityList) {
                            log.debug('criteria', criteria);
                            var retunResult = getAmountByCriteria(resultObj, criteria);
                            budgetTotal = retunResult.amount;
                            applicableLine = retunResult.line;
                            budgetID = applicableLine.id;
                            if (_logValidation(budgetTotal)) {
                                break;
                            }
                        }
                    }
                   
                    log.debug('budgetTotal', budgetTotal);
                    log.debug('applicableLine', applicableLine);
                    log.debug('budgetID', budgetID);

                    if (_logValidation(budgetTotal)) {
                        var segmentOnBudget = getSegments(applicableLine);

                        log.debug('segmentOnBudget', segmentOnBudget);

                        currentRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_ocr_bdgt_itms_ac', value: getAccount });// item applicable account
                        currentRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_ptc_ocr_segment_on_budget', value: segmentOnBudget });// budget segment
                        currentRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_pts_ocr_budgetamount', value: budgetTotal }); //custcol_pts_ocr_budgetamount //custcol_custom_budget_amt
                        currentRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_pts_ocr_budgetwrnig', value: '' })// budget warning
                        currentRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_mit_alocted_budget', value: budgetID })//Allocated budget
                        currentRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_pts_mit_bdgt_ac_grp_line', value: bdgtAcGroup })// budget account group
                    } else {
                        currentRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_pts_ocr_budgetwrnig', value: 'Budget is not available for this line' })
                        currentRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_ocr_bdgt_itms_ac', value: getAccount });
                        currentRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_ptc_ocr_segment_on_budget', value: '' });
                        currentRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_pts_ocr_budgetamount', value: '' });
                        currentRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_pts_ocr_budgetconsumdamnt', value: '' });
                        currentRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_pts_ocr_budgetexcidngamnt', value: '' });
                        currentRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_pts_mit_bdgt_ac_grp_line', value: '' })// budget account group
                        log.debug('No budget found for this item', 'budget missing')
                        alert("Notice : Budget is not available for this line");

                        return false;
                    }

                } //sublistField = item end

            } catch (e) {

                log.debug('validate Line Error', e.message);
            }

            return true;
        }

        //****************************************Used Function********************************* */

        function getSegments(applicableLine) {
            let prioritySeq = 0;
        
            var getlineclass = applicableLine.custrecord_pts_mit_bdgt_class; // D/S
            var getLineCC = applicableLine.custrecord_pts_mit_costcenter; // CC
            var getLineLocation = applicableLine.custrecord_pts_mit_bdgt_location; // L
        
            if (getlineclass && getLineCC && getLineLocation) {
                prioritySeq = 102; // All three values are available
            } else if (getlineclass && getLineCC) {
                prioritySeq = 101; // D/S and CC are available
            } else if (getlineclass && getLineLocation) {
                prioritySeq = 2; // D/S and L are available
            } else if (getlineclass) {
                prioritySeq = 1; // Only D/S is available
            }
        
            return prioritySeq;
        }

        function findGroup(uniqueAccountArray){
            try{

                var uniqueAccountArrayStry =  '"' + uniqueAccountArray.join('","') + '"';
                log.debug('uniqueAccountArrayStry',uniqueAccountArrayStry);

            var customrecord_pts_mit_bdgtgrupaccSearchObj = search.create({
                type: "customrecord_pts_mit_bdgtgrupacc",
                filters:
                [
                   ["custrecord_pts_mit_acc","anyof", uniqueAccountArray] //uniqueAccountArrayStry
                ],
                columns:
                [
                   search.createColumn({name: "internalid", label: "Internal ID"})
                ]
             });
             var groupName;
             var searchResultCount = customrecord_pts_mit_bdgtgrupaccSearchObj.runPaged().count;
             log.debug("customrecord_pts_mit_bdgtgrupaccSearchObj result count",searchResultCount);
             customrecord_pts_mit_bdgtgrupaccSearchObj.run().each(function(result){
                groupName = result.getValue(customrecord_pts_mit_bdgtgrupaccSearchObj.columns[0]);
                log.debug('groupName',groupName);
                return true;
             });

             return groupName;

            }catch(e){
                log.debug('Find Budget Account Group error',e);
            }
        }

        function findBudget(bdgtAcGroup, financialYear, uniqeGetClassArray, uniqeGetDepartment, uniqeGetlocationArray) {
    
            // Convert arrays to comma-separated strings with values wrapped in single quotes
            var uniqeGetClassArrayStr = uniqeGetClassArray.map(value => `'${value}'`).join(",");
            var uniqeGetDepartmentStr = uniqeGetDepartment.map(value => `'${value}'`).join(",");
            var uniqeGetlocationArrayStr = uniqeGetlocationArray.map(value => `'${value}'`).join(",");
            var uniqueAccountArrayStr = bdgtAcGroup
        
            var sql = `SELECT 
            BUILTIN_RESULT.TYPE_INTEGER(CUSTOMRECORD_PTS_MIT_BUDGETFUNDS.ID) AS ID, 
            BUILTIN_RESULT.TYPE_INTEGER(CUSTOMRECORD_PTS_MIT_BUDGETFUNDS.custrecord_pts_mit_bdgtaccgeup) AS custrecord_pts_mit_bdgtaccgeup, 
            BUILTIN_RESULT.TYPE_INTEGER(CUSTOMRECORD_PTS_MIT_BUDGETFUNDS.custrecord_pts_mit_bdgt_class) AS custrecord_pts_mit_bdgt_class, 
            BUILTIN_RESULT.TYPE_INTEGER(CUSTOMRECORD_PTS_MIT_BUDGETFUNDS.custrecord_pts_mit_costcenter) AS custrecord_pts_mit_costcenter, 
            BUILTIN_RESULT.TYPE_INTEGER(CUSTOMRECORD_PTS_MIT_BUDGETFUNDS.custrecord_pts_mit_bdgt_location) AS custrecord_pts_mit_bdgt_location, 
            BUILTIN_RESULT.TYPE_CURRENCY(CUSTOMRECORD_PTS_MIT_BUDGETFUNDS.custrecord_pts_mit_bdgt_amt, BUILTIN.CURRENCY(CUSTOMRECORD_PTS_MIT_BUDGETFUNDS.custrecord_pts_mit_bdgt_amt)) AS custrecord_pts_mit_bdgt_amt
          FROM 
            CUSTOMRECORD_PTS_MIT_BUDGETFUNDS
          WHERE 
            ((CUSTOMRECORD_PTS_MIT_BUDGETFUNDS.custrecord_pts_mit_bdgt_class IN (${uniqeGetClassArrayStr}) OR CUSTOMRECORD_PTS_MIT_BUDGETFUNDS.custrecord_pts_mit_bdgt_class IS NULL))
             AND ((CUSTOMRECORD_PTS_MIT_BUDGETFUNDS.custrecord_pts_mit_costcenter IN (${uniqeGetDepartmentStr}) OR CUSTOMRECORD_PTS_MIT_BUDGETFUNDS.custrecord_pts_mit_costcenter IS NULL))
             AND ((CUSTOMRECORD_PTS_MIT_BUDGETFUNDS.custrecord_pts_mit_bdgt_location IN (${uniqeGetlocationArrayStr}) OR CUSTOMRECORD_PTS_MIT_BUDGETFUNDS.custrecord_pts_mit_bdgt_location IS NULL))
             AND UPPER(BUILTIN.DF(CUSTOMRECORD_PTS_MIT_BUDGETFUNDS.custrecord_pts_mit_bdgt_fy)) = '${financialYear}'
             AND CUSTOMRECORD_PTS_MIT_BUDGETFUNDS.custrecord_pts_mit_bdgtaccgeup IN (${uniqueAccountArrayStr})`;
        
            // Run the query
            var resultSet = query.runSuiteQL({ query: sql });
            log.debug('resultSet', resultSet);
        
            var resultObj = resultSet.asMappedResults();
            log.debug("Mapped Results", resultObj);
            log.debug("Mapped Results length", resultObj.length);
        
            return resultObj;
        }
        
        function _nullValidation(value) {
            if (value == null || value == undefined || value == '' || value == 0 || value == '0' || value == 'NaN') {
                return true;
            }
            else {
                return false;
            }
        }

        function _logValidation(value) {
            if (value != null && value != '' && value != undefined && value != 'undefined' && value != 'NaN' && value != ' ' && value != 0 && value != '0') {
                return true;
            }
            else {
                return false;
            }
        }

        function getFinancialYear(date) {
            var year = date.getFullYear();
            var month = date.getMonth() + 1; // getMonth() returns 0-11
            // Financial year starts in April
            if (month < 4) {
                return (year - 1) + '-' + year;
            } else {
                return year + '-' + (year + 1);
            }
        }

        function getAmountByCriteria(array, criteria) {
            const result = array.find(item => {
                return Object.keys(criteria).every(key => criteria[key] === undefined || item[key] === criteria[key]);
            });
            return result ? { amount: result.custrecord_pts_mit_bdgt_amt, line: result } : { amount: '', line: '' };
        }

        return {
            validateLine: validateLine
        };
    });