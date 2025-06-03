/**
* @NApiVersion 2.1
* @NScriptType UserEventScript
*/
define(['N/record', 'N/search', 'N/ui/message', 'N/log','N/error','N/runtime'], function (record, search, message, log,error,runtime) {

    function beforeSubmit(context) {
        //try {
            if (runtime.executionContext == "CSVIMPORT"){

            var currentRecord = context.newRecord;

            var financialYear = currentRecord.getValue('custrecord_pts_mit_bdgt_fy');
            var budgetAccountGroup = currentRecord.getValue('custrecord_pts_mit_bdgtaccgeup');
            var departmentSchoolClass = currentRecord.getValue('custrecord_pts_mit_bdgt_class');
            var costCenter = currentRecord.getValue('custrecord_pts_mit_costcenter');
            var location = currentRecord.getValue('custrecord_pts_mit_bdgt_location');
            var currentRecordId = currentRecord.id;
            log.debug('currentRecordId', currentRecordId);

            var duplicatRecordCount = findDuplicatRecord(financialYear, budgetAccountGroup, departmentSchoolClass, costCenter, location, currentRecordId);
            log.debug('duplicatRecordCount', duplicatRecordCount);

            if (duplicatRecordCount > 0) {

                // message.create({
                //     title: 'Duplicate Record',
                //     message: 'A Budgeted Fund record with the same combination of fields already exists.',
                //     type: message.Type.WARNING
                // }).show();

                // return false;

                throw error.create({
                    name: 'DUPLICATE_RECORD_ERROR',
                    message: 'A Budgeted Fund record with the same combination of fields already exists.',
                    notifyOff: false
                });
            }
        }
        
            //return true;
        // } catch (e) {
        //     log.debug('Duplicate Budgeted Fund Record error', e);
        // }

        // ----------------------------- Used Function ------------------------------------

        function findDuplicatRecord(financialYear, budgetAccountGroup, departmentSchoolClass, costCenter, location, currentRecordId) {
            try {
                var filters =[
                    ["custrecord_pts_mit_bdgt_fy","anyof",financialYear], 
                    "AND", 
                    ["custrecord_pts_mit_bdgtaccgeup","anyof",budgetAccountGroup], 
                    "AND", 
                    ["custrecord_pts_mit_bdgt_class","anyof",departmentSchoolClass], 
                    "AND", 
                    ["custrecord_pts_mit_costcenter","anyof",costCenter]
                    //"AND", 
                    //[["custrecord_pts_mit_bdgt_location","anyof",location],"OR",["custrecord_pts_mit_bdgt_location","anyof","@NONE@"]]
                 ];

                 if (location) {
                    filters.push("AND", ["custrecord_pts_mit_bdgt_location", "anyof", location]);
                } else {
                    filters.push("AND", ["custrecord_pts_mit_bdgt_location", "anyof", "@NONE@"]);
                }

                if (currentRecordId) {
                    filters.push('AND', ['internalid', 'noneof', currentRecordId]);
                }

                var duplicateSearch = search.create({
                    type: 'customrecord_pts_mit_budgetfunds',
                    filters: filters,
                    columns: ['internalid']
                });

                var searchResultCount = duplicateSearch.runPaged().count;
                log.debug("duplicateSearch result count", searchResultCount);

                return searchResultCount;

            } catch (e) {
                log.debug('findDuplicatRecordSearch error', e);
            }
        }
    }

    return {
        beforeSubmit: beforeSubmit
    };
});
