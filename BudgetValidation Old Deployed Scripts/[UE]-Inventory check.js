/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
/*************************************************************************************
 * 
 * @version 1.1 21 April 2025: PTS066, Updated function for Consumed amount calculation updating in Budget Funds record
 */
 define(["SuiteScripts/pts_helper", "N/record", "N/currentRecord", "N/runtime", "N/format", "N/search", "N/task", "N/url", "N/https"],
 function (util, record, currentRecord, runtime, format, search, task, url, https) {

  const BUDGET_FUNDS_REC_TYPE = 'customrecord_pts_mit_budgetfunds';
   function afterSubmit(context) {
     var CurrentRecord = context.newRecord;

     var tranType = CurrentRecord.type;
     log.debug('tranType', tranType)

     var recId = CurrentRecord.id;
     log.debug('recId', recId);

     if(tranType == 'purchaseorder' || tranType == 'vendorbill' || tranType == 'purchaserequisition'){

      try {

         //var recCurrent = context.newRecord;

         var recCurrent = record.load({
          type: tranType,
          id: recId,
          //isDynamic: boolean,
          //defaultValues: Object
        })

         cols = [
           'custcol_mit_alocted_budget',
           'custcol_pts_ocr_budgetconsumdamnt',
           'itemtype'
         ]
 
         var getIRLines = util.getLines(recCurrent, 'item', cols);
         //log.debug('getIRLines', getIRLines);
 
         try{
         let allocatedBudgets = util.pick(getIRLines,'custcol_mit_alocted_budget');
        
         //var budgetIdGroup = util.groupBy(getIRLines, 'custcol_mit_alocted_budget');
         //log.debug('budgetIdGroup', budgetIdGroup);
 

         var allocatedBudgetLinks = [...new Set(allocatedBudgets)];
         log.debug("allocatedBudgetLinks",allocatedBudgetLinks);
         if(allocatedBudgetLinks.length>0){

            let serObj = {
              type: BUDGET_FUNDS_REC_TYPE,
              filters:
   [
      ["internalid","anyof",allocatedBudgetLinks]
   ],
   columns:
   [
      search.createColumn({name: "custrecord_pts_mit_bdgt_fy", label: "Financial Year"}),
      search.createColumn({name: "custrecord_pts_mit_bdgt_class", label: "Department / School"}),
      search.createColumn({name: "custrecord_pts_mit_bdgt_location", label: "location"}),
      search.createColumn({name: "custrecord_pts_mit_bdgt_amt", label: "Budget Amount"}),
      search.createColumn({name: "custrecord_pts_mit_consumedamnt", label: "Consumed Amount"}),
      search.createColumn({name: "custrecord_pts_mit_bdgtaccgeup", label: "Budget Account Group"}),
      search.createColumn({name: "custrecord_pts_mit_costcenter", label: "Cost centre"}),
      
   ]
            }

          var collectiiveBudgetData = util.getSearch(serObj.type,serObj.filters,serObj.columns);
         }


       
if(allocatedBudgetLinks.length<20){
    log.debug("allocatedBudgetLinks.length",allocatedBudgetLinks.length);
    for(var i in allocatedBudgetLinks ){
      let budgetFundRecId = allocatedBudgetLinks[i];
      let consumedAmount = calculateConsumedAmount(budgetFundRecId,collectiiveBudgetData);
      updateConsumedAmountInBudgetFunds(budgetFundRecId,consumedAmount);
      let usageRemaining = runtime.getCurrentScript().getRemainingUsage();
      log.debug("usageRemaining",usageRemaining);
    }
}

else {
    log.debug("allocatedBudgetLinks.length",allocatedBudgetLinks.length);
    scheduleJVCreation(recId,tranType);
}
  }catch(e){
    log.error("error calculation",e);
   }

// Commented by PTS066 - replaced by above function
    //      for(var linebdgt in budgetIdGroup){
 
    //        log.debug('linebdgt',linebdgt);
    //       if(linebdgt){
    //        var lines = budgetIdGroup[linebdgt];
    //        log.debug('lines',lines);
 
    //        var consumedAmtSum =  lines[0].custcol_pts_ocr_budgetconsumdamnt;
    //        //var consumedAmtSum = util.sum(lines,'custcol_pts_ocr_budgetconsumdamnt');
    //        log.debug('total consumed Amount',consumedAmtSum);

    //        record.submitFields({
    //          type: 'customrecord_pts_mit_budgetfunds',
    //          id: linebdgt ,
    //          values: {'custrecord_pts_mit_consumedamnt':consumedAmtSum},
    //        })
    //       }
    //    }
 
       } catch (e) {
         log.debug('after submit Consumed Amount update in Budget', e);
       }

     }




     if(tranType == 'purchaserequisition'){  
     try {
       var loadRec = record.load({
         type: record.Type.PURCHASE_REQUISITION,
         id: recId,
         //isDynamic: boolean,
         //defaultValues: Object
       })
      
       var getIRLines = util.getLines(loadRec, 'item', cols);
       //log.debug('getIRLines', getIRLines);

       for (var i = 0; i < getIRLines.length; i++) {
         var itemType = getIRLines[i].itemtype;

         if (itemType === "InvtPart" || itemType === "Assembly") {
           hasInventoryOrAssemblyItem = true;
           break; // Exit the loop early if condition is met
         }
       }
       log.debug('hasInventoryOrAssemblyItem',hasInventoryOrAssemblyItem);
       if (hasInventoryOrAssemblyItem == true) {
         loadRec.setValue({
           fieldId: 'custbody_pts_mit_invinlines',
           value: true

         })
       }
       loadRec.save({
         enableSourcing: true,
         ignoreMandatoryFields: true
       })
     } catch (e) {
       log.debug('after submit Inventory Check', e);
     }
   }
   

   }// after submit end

 function calculateConsumedAmount(budgetId,dataPool){
try{

 

let budgetData = dataPool.find(item => item.id === budgetId);



var financialYear = budgetData.custrecord_pts_mit_bdgt_fy_txt;
var splitFY = financialYear.split('-');
var firstDayOfYear = '01/04/' + splitFY[0];
var lastDayOfYear = '31/03/' + splitFY[1];
var bdgtAcountGroup = budgetData.custrecord_pts_mit_bdgtaccgeup;
var uniqeGetClassArray = budgetData.custrecord_pts_mit_bdgt_class;

var uniqeGetDepartmentArray = budgetData.custrecord_pts_mit_costcenter;

var uniqeGetlocationArray = budgetData.custrecord_pts_mit_bdgt_location;


var searchACFromGroup = search.lookupFields({
  type: 'customrecord_pts_mit_bdgtgrupacc',
  id: bdgtAcountGroup,
  columns: ['custrecord_pts_mit_acc']
});
//log.debug('searchACFromGroup', searchACFromGroup);

var accountValues = searchACFromGroup.custrecord_pts_mit_acc.value; // This is a comma-separated string
//log.debug('accountValues', accountValues);

var uniqueAccountArray = accountValues.split(',').map(function (item) {
  return item.trim(); // Remove any extra spaces, just in case
});


var bdgtConsumedAmt = consumedAmount(uniqeGetClassArray, uniqeGetDepartmentArray, uniqeGetlocationArray, uniqueAccountArray, firstDayOfYear, lastDayOfYear);


log.debug("total consumed Amount : New calculated",bdgtConsumedAmt);

return bdgtConsumedAmt;


}catch(e){

  log.error("error on calculateConsumedAmount",e);
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

 function consumedAmount(uniqeGetClassArray, uniqeGetDepartmentArray, uniqeGetlocationArray, uniqueAccountArray, firstDayOfYear, lastDayOfYear) {
  try {

      var prSearchResultObj = MITBudgetPRNotConvertedInPO(uniqueAccountArray, firstDayOfYear, lastDayOfYear, uniqeGetClassArray, uniqeGetDepartmentArray, uniqeGetlocationArray) || 0;
      //log.debug('prSearchResultObj', prSearchResultObj);

      var prSearchAmt = prSearchResultObj.reduce(function (accumulator, current) {
          return accumulator + current.consumedAmount;
      }, 0);
      //log.debug('prSearchAmt', prSearchAmt);

      var poSearchResultObj = MITBudgetPOIsNotBilledAndLineConsumedAmount(uniqeGetDepartmentArray, uniqueAccountArray, uniqeGetClassArray, uniqeGetlocationArray, firstDayOfYear, lastDayOfYear) || 0;
      //log.debug('poSearchResultObj', poSearchResultObj);

      var poSearchAmt = poSearchResultObj.reduce(function (accumulator, current) {
          return accumulator + current.consumedAmount;
      }, 0);
      //log.debug('poSearchAmt', poSearchAmt);

      //log.debug('firstDayOfYear 111 before function',firstDayOfYear);
      var vbSearchResultObj = MITBudgetVendorBill(uniqeGetDepartmentArray, uniqeGetClassArray, uniqeGetlocationArray,firstDayOfYear, lastDayOfYear) || 0;
      //log.debug('vbSearchResultObj', vbSearchResultObj);

      // var vbSearchAmt = vbSearchResultObj.reduce(function (accumulator, current) {
      //     return accumulator + current.consumedAmount;
      // }, 0);
      var vbSearchAmt = vbSearchResultObj.filter(function (record) {
          return uniqueAccountArray.includes(record.account.toString());
      }).reduce(function (sum, record) {
          return sum + record.consumedAmount;
      }, 0);
      //log.debug('vbSearchAmt', vbSearchAmt);

      var billCredtSearchResultObj = MITBudgetBillCredit(uniqeGetDepartmentArray, uniqeGetClassArray, uniqeGetlocationArray, uniqueAccountArray, firstDayOfYear, lastDayOfYear) || 0;
      //log.debug('billCredtSearchResultObj', billCredtSearchResultObj);

      var billCredtSearchAmt = billCredtSearchResultObj.reduce(function (accumulator, current) {
          return accumulator + current.consumedAmount;
      }, 0);
      //log.debug('billCredtSearchAmt', billCredtSearchAmt);

      /**
              Search 1 - MIT Budget - Requisition
              Search 2 - MIT Budget - PO != Billed & Line Consumed Amount 
              Search 3 - MIT Budget - Vendor Bill 
              Search 4 - MIT Budget - Bill Credit 
              
              The Formula to calculate the Consumed Amount is –  
              Consumed Amount = (Search 1) + (Search 2) + (Search 3) – (Search 4) 
          */


      var consumedAmt = (Number(prSearchAmt) + Number(poSearchAmt) + Number(vbSearchAmt) - Number(billCredtSearchAmt));
      //log.debug('consumedAmt', consumedAmt);

      return consumedAmt;

  } catch (e) {
      log.debug("Error: Consumed Amount", e);
  }
} // Validate Budget Function End


function MITBudgetPRNotConvertedInPO(uniqueAccountArray, firstDayOfYear, lastDayOfYear, uniqeGetClassArray, uniqeGetDepartmentArray, uniqeGetlocationArray) {

  //log.debug('firstDayOfYear', firstDayOfYear);
  //log.debug('lastDayOfYear', lastDayOfYear);

  var filters = [
      ["type", "anyof", "PurchReq"],
      "AND",
      ["duedate", "within", firstDayOfYear, lastDayOfYear],
      "AND",
      ["status", "anyof", "PurchReq:B", "PurchReq:D", "PurchReq:F", "PurchReq:A"],
      "AND",
      ["mainline", "is", "F"],
      "AND",
      ["closed", "is", "F"],
      "AND",
      ["account", "anyof", uniqueAccountArray],
      "AND",
      ["class", "anyof", uniqeGetClassArray],
       "AND",
       ["custbody_pts_mit_budgetstatus", "noneof", "6", "7","12"]

  ]

  if (uniqeGetlocationArray && uniqeGetlocationArray.length > 0) {
      filters.push("AND", ["custcol_pts_mit_budgetlocation", "anyof", uniqeGetlocationArray]);
  }

  if (uniqeGetDepartmentArray && uniqeGetDepartmentArray.length > 0) {
      filters.push("AND", ["department", "anyof", uniqeGetDepartmentArray]);
  }

  var purchaserequisitionSearchObj = search.create({
      type: "purchaserequisition",
      filters: filters,
      columns:
          [
              // search.createColumn({
              //     name: "trandate",
              //     summary: "GROUP",
              //     label: "Date"
              // }),
              search.createColumn({
                  name: "account",
                  summary: "GROUP",
                  label: "Account"
              }),
              search.createColumn({
                  name: "class",
                  summary: "GROUP",
                  label: "Department / School"
              }),
              search.createColumn({
                  name: "custcol_pts_mit_budgetlocation",
                  summary: "GROUP",
                  label: "Budget Location"
              }),
              search.createColumn({
                  name: "formulanumeric",
                  summary: "SUM",
                  formula: "(NVL({estimatedamount}, 0) - NVL({purchaseorder.amount}, 0))",
                  label: "Consumed Amount"
               }),
              search.createColumn({
                  name: "department",
                  summary: "GROUP",
                  label: "Cost Center"
              })
          ]
  });
  var searchResult = [];
  var getSearchAc; var getSearchClass; var getSearchLoc; var getSearchAmt; var getSearchDept;

  var searchResultCount = purchaserequisitionSearchObj.runPaged().count;
 // ("purchaserequisitionSearchObj result count", searchResultCount);
  if (_logValidation(searchResultCount)) {
      purchaserequisitionSearchObj.run().each(function (result) {

          getSearchAc = (result.getValue(purchaserequisitionSearchObj.columns[0]));
          getSearchClass = (result.getValue(purchaserequisitionSearchObj.columns[1]));
          getSearchLoc = (result.getValue(purchaserequisitionSearchObj.columns[2]));
          getSearchAmt = Math.abs(result.getValue(purchaserequisitionSearchObj.columns[3]));
          //log.debug("getSearchAmt",getSearchAmt)
          getSearchDept = Math.abs(result.getValue(purchaserequisitionSearchObj.columns[4]));

          var lineObj = { "account": Number(getSearchAc), "class": Number(getSearchClass), "department": Number(getSearchDept), "location": Number(getSearchLoc), "consumedAmount": Number(getSearchAmt) }
          searchResult.push(lineObj);
          return true;
      });
  }

  //log.debug('PR Search', searchResult);
  return searchResult;
}

function MITBudgetPOIsNotBilledAndLineConsumedAmount(uniqeGetDepartmentArray, uniqueAccountArray, uniqeGetClassArray, uniqeGetlocationArray, firstDayOfYear, lastDayOfYear) {

  var filters = [
      ["type", "anyof", "PurchOrd"],
      "AND",
      ["mainline", "is", "F"],
      "AND",
      ["amountunbilled", "lessthanorequalto", "0.00"],
      "AND",
      ["duedate", "within", firstDayOfYear, lastDayOfYear],
      "AND",
      ["taxline", "is", "F"],
      "AND",
      ["class", "anyof", uniqeGetClassArray],
      "AND",
      ["account", "anyof", uniqueAccountArray],
      "AND",
      ["voided", "is", "F"],
      "AND",
      ["status", "noneof", "PurchOrd:H", "PurchOrd:G"],
      "AND",
      ["closed", "is", "F"],
      "AND",
     ["custbody_pts_mit_budgetstatus", "noneof", "6", "7","12"]
  ]

  if (uniqeGetlocationArray && uniqeGetlocationArray.length > 0) {
      filters.push("AND", ["custcol_pts_mit_budgetlocation", "anyof", uniqeGetlocationArray]);
  }

  if (uniqeGetDepartmentArray && uniqeGetDepartmentArray.length > 0) {
      filters.push("AND", ["department", "anyof", uniqeGetDepartmentArray]);
  }

  var purchaseorderSearchObj = search.create({
      type: "purchaseorder",
      settings: [{ "name": "consolidationtype", "value": "ACCTTYPE" }],
      filters: filters,
      columns:
          [
              search.createColumn({
                  name: "account",
                  summary: "GROUP",
                  label: "Account"
              }),
              search.createColumn({
                  name: "class",
                  summary: "GROUP",
                  label: "Department / School"
              }),
              search.createColumn({
                  name: "custcol_pts_mit_budgetlocation",
                  summary: "GROUP",
                  label: "Budget Location"
              }),
              search.createColumn({
                  name: "formulacurrency",
                  summary: "SUM",
                  formula: "((ABS({quantity})-ABS({quantitybilled}))*{rate})",
                  label: "Consumed Amount"
              }),
              search.createColumn({
                  name: "department",
                  summary: "GROUP",
                  label: "Cost Center"
              })
          ]
  });
  var searchResult = [];
  var getSearchAc; var getSearchClass; var getSearchLoc; var getSearchAmt; var getSearchDept;
  var searchResultCount = purchaseorderSearchObj.runPaged().count;
  //log.debug("purchaseorderSearchObj result count", searchResultCount);

  if (_logValidation(searchResultCount)) {
      purchaseorderSearchObj.run().each(function (result) {
          getSearchAc = (result.getValue(purchaseorderSearchObj.columns[0]));
          getSearchClass = (result.getValue(purchaseorderSearchObj.columns[1]));
          getSearchLoc = (result.getValue(purchaseorderSearchObj.columns[2]));
          getSearchAmt = Math.abs(result.getValue(purchaseorderSearchObj.columns[3]));
          getSearchDept = Math.abs(result.getValue(purchaseorderSearchObj.columns[4]));

          var lineObj = { "account": Number(getSearchAc), "class": Number(getSearchClass), "department": Number(getSearchDept), "location": Number(getSearchLoc), "consumedAmount": Number(getSearchAmt) }
          searchResult.push(lineObj);
          return true;
      });
  }

  //log.debug('PO Search', searchResult);
  return searchResult;
}

function MITBudgetVendorBill(uniqeGetDepartmentArray, uniqeGetClassArray, uniqeGetlocationArray,firstDayOfYear, lastDayOfYear) {

  // log.debug('VB uniqeGetDepartmentArray',uniqeGetDepartmentArray);
  // log.debug('VB uniqeGetClassArray',uniqeGetClassArray);
  // log.debug('VB uniqeGetlocationArray',uniqeGetlocationArray);
  // log.debug('VB firstDayOfYear',firstDayOfYear);
  // log.debug('VB lastDayOfYear',lastDayOfYear);
  
  var filters = [
      ["type", "anyof", "VendBill"],
      "AND",
      ["mainline", "is", "F"],
      "AND",
      ["trandate", "within", firstDayOfYear, lastDayOfYear],
      "AND",
      ["taxline", "is", "F"],
      "AND",
      ["class", "anyof", uniqeGetClassArray],
      "AND",
      ["voided", "is", "F"],
      "AND",
      ["approvalstatus", "anyof", "1", "2", "11"],
      "AND",
      ["status", "noneof", "VendBill:C", "VendBill:E"],
       "AND",
       ["custbody_pts_mit_budgetstatus", "noneof", "6", "7","12"],
      "AND", 
      ["item","noneof","6873"]

  ]

  if (uniqeGetlocationArray && uniqeGetlocationArray.length > 0) {
      filters.push("AND", ["custcol_pts_mit_budgetlocation", "anyof", uniqeGetlocationArray]);
  }

  if (uniqeGetDepartmentArray && uniqeGetDepartmentArray.length > 0) {
      filters.push("AND", ["department", "anyof", uniqeGetDepartmentArray]);
  }

  var transactionSearchObj = search.create({
      type: "vendorbill",
      settings: [{ "name": "consolidationtype", "value": "ACCTTYPE" }],
      filters: filters,
      columns:
          [
              search.createColumn({
                  name: "account",
                  summary: "GROUP",
                  label: "Account"
              }),
              search.createColumn({
                  name: "class",
                  summary: "GROUP",
                  label: "Department / School"
              }),
              search.createColumn({
                  name: "department",
                  summary: "GROUP",
                  label: "Cost Center"
              }),
              search.createColumn({
                  name: "custcol_pts_mit_budgetlocation",
                  summary: "GROUP",
                  label: "Budget Location"
              }),
              search.createColumn({
                  name: "formulacurrency",
                  summary: "SUM",
                  formula: "((ABS({quantity})-ABS({quantitybilled}))*{rate})",
                  label: "Consumed Amount"
              }),
              search.createColumn({
                  name: "formulanumeric",
                  summary: "GROUP",
                  formula: " case when {item.type}='Inventory Item' then {item.assetaccount.id} when {item.type}='Assembly' then {item.assetaccount.id} when {item.type} ='Non-Inventory Item' then {item.expenseaccount.id} when {item.type}='Service' then {item.expenseaccount.id} when {item.type}='OthCharge' then {item.expenseaccount.id} else {account.id} end",
                  label: "Account ID"
              })

          ]
  });

  var searchResult = [];
  var getSearchAc; var getSearchClass; var getSearchLoc; var getSearchAmt; var getSearchDept;

  var searchResultCount = transactionSearchObj.runPaged().count;
 // log.debug("transactionSearchObj result count", searchResultCount);

  if (_logValidation(searchResultCount)) {
      transactionSearchObj.run().each(function (result) {

          getSearchAc = (result.getValue(transactionSearchObj.columns[5]));
          getSearchClass = (result.getValue(transactionSearchObj.columns[1]));
          getSearchLoc = (result.getValue(transactionSearchObj.columns[3]));
          getSearchAmt = Math.abs(result.getValue(transactionSearchObj.columns[4]));
          getSearchDept = Math.abs(result.getValue(transactionSearchObj.columns[2]));
          var lineObj = { "account": Number(getSearchAc), "class": Number(getSearchClass), "department": getSearchDept, "location": Number(getSearchLoc), "consumedAmount": Number(getSearchAmt) }
          searchResult.push(lineObj);

          return true;
      });
  }

  //log.debug('VB Search', searchResult);
  return searchResult;
}

function MITBudgetBillCredit(uniqeGetDepartmentArray, uniqeGetClassArray, uniqeGetlocationArray, uniqueAccountArray, firstDayOfYear, lastDayOfYear) {

  var filters = [
      ["type", "anyof", "VendCred"],
      "AND",
      ["mainline", "is", "F"],
      "AND",
      ["trandate", "within", firstDayOfYear, lastDayOfYear],
      "AND",
      ["taxline", "is", "F"],
      "AND",
      ["class", "anyof", uniqeGetClassArray],
      "AND",
      ["voided", "is", "F"],
      "AND",
      ["cogs", "is", "F"],
      "AND",
      ["account", "anyof", uniqueAccountArray],
      "AND", 
      ["item","noneof","6873"],
      "AND", 
      ["custbody_pts_bdgt_nt_rec","is","F"]
  ]

  if (uniqeGetlocationArray && uniqeGetlocationArray.length > 0) {
      filters.push("AND", ["custcol_pts_mit_budgetlocation", "anyof", uniqeGetlocationArray]);
  }

  if (uniqeGetDepartmentArray && uniqeGetDepartmentArray.length > 0) {
      filters.push("AND", ["department", "anyof", uniqeGetDepartmentArray]);
  }

  var vendorcreditSearchObj = search.create({
      type: "vendorcredit",
      settings: [{ "name": "consolidationtype", "value": "ACCTTYPE" }],
      filters: filters,
      columns:
          [
              search.createColumn({
                  name: "account",
                  summary: "GROUP",
                  label: "Account"
              }),
              search.createColumn({
                  name: "class",
                  summary: "GROUP",
                  label: "Department / School"
              }),
              search.createColumn({
                  name: "custcol_pts_mit_budgetlocation",
                  summary: "GROUP",
                  label: "Budget Location"
              }),
              search.createColumn({
                  name: "formulacurrency",
                  summary: "SUM",
                  formula: "((ABS({quantity})-ABS({quantitybilled}))*{rate})",
                  label: "Consumed Amount"
              }),
              search.createColumn({
                  name: "department",
                  summary: "GROUP",
                  label: "Cost Center"
              })
          ]
  });
  var searchResult = [];
  var getSearchAc; var getSearchClass; var getSearchLoc; var getSearchAmt; var getSearchDept;
  var searchResultCount = vendorcreditSearchObj.runPaged().count;
  //log.debug("vendorcreditSearchObj result count", searchResultCount);

  if (_logValidation(searchResultCount)) {
      vendorcreditSearchObj.run().each(function (result) {
          getSearchAc = (result.getValue(vendorcreditSearchObj.columns[0]));
          getSearchClass = (result.getValue(vendorcreditSearchObj.columns[1]));
          getSearchLoc = (result.getValue(vendorcreditSearchObj.columns[2]));
          getSearchAmt = Math.abs(result.getValue(vendorcreditSearchObj.columns[3]));
          getSearchDept = Math.abs(result.getValue(vendorcreditSearchObj.columns[4]));
          var lineObj = { "account": Number(getSearchAc), "class": Number(getSearchClass), "department": getSearchDept, "location": Number(getSearchLoc), "consumedAmount": Number(getSearchAmt) }
          searchResult.push(lineObj);

          return true;
      });
  }

  //log.debug('Bill Credit Search', searchResult);
  return searchResult;
}

/**
 * @description update Consumed amountbfield in budget funds record
 * @param {} recId Internal Id of record
 * @param {*} amount Amount to be updated
 */
function updateConsumedAmountInBudgetFunds(recId,amount){
    try{

      //  log.debug("amount in updating record",amount);
    if(recId){
        record.submitFields({
            type: 'customrecord_pts_mit_budgetfunds',
            id: recId ,
            values: {'custrecord_pts_mit_consumedamnt':amount},
          });

        }
    }catch(e){
        log.error("error on updateConsumedAmountInBudgetFunds",e);
    }
}

/**
 * @description Calls the scheduleds script to trigger the update for consumed amount in budget record
 * @param {} recId 
 * @param {*} recType 
 */
function scheduleJVCreation(recId,recType){
    log.debug("recId in scheduling",recId);
    try{
      var schedTask = task.create({
        taskType: task.TaskType.SCHEDULED_SCRIPT,
        scriptId: 'customscript_pts_ss_update_budget_fund',
        deploymentId:'customdeploy_pts_ss_update_budget_fund',
        params: {
            custscript_pts_trans_id: recId,
            custscript_pts_trans_type:recType
        }
      });
  
      var taskId = schedTask.submit();
      log.debug('Scheduled Script Task ID', taskId);


    }catch(e){
      log.error("error on JV creation scheduling",e);

    }

  }

   return {
     afterSubmit: afterSubmit
   }
 })