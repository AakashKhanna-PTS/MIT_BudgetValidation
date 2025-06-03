/**
 *@NApiVersion 2.1
 *@NScriptType Suitelet
 */
//GLOBALS FOR HELPER FN
var SEARCH,
  RECORD,
  RUNTIME,
  MOMENT,
  LOG_TYPE,
  TAG,
  MODE,
  CURRENT_RECORD,
  MESSAGE,
  logger;
//GLOBALS FOR VALIDATION
var ITEM_LIST,
  EXPENSE_LIST,
  BACK_TRACK,
  FUND_CENTER_LIST,
  RELEASE_LIST,
  OLD_FIN_YEAR,
  OLD_DATE;
var ITEM_LINES_REM_FLG, EXP_LINES_REM_FLG, LOCATION_LIST;
var EXCHANGE_RATE, CURRENCY, OLD_CURRENCY, OLD_EXCHANGE_RATE;
var PREV_VALUES_TABLE = [];
//changes for PO ->BILL
var PO_DATA = [];
var REQ_PO_LINES = [];
var CNVRT_FROM_PO = false;
var FIRST_EDIT = false;
const INR = 1;
var CUR_REC;
const EXCLUDE_VENDORS = ["15", "16", "17", "18", "19"]
define([
  "N/runtime",
  "N/search",
  "N/record",
  "SuiteScripts/moment",
  "N/redirect",
  "SuiteScripts/budgets/Helper/pts_table_gen"
], function (runtime, search, record, moment, redirect, tableGen) {

  function onRequest(context) {
    try {

      var scriptObj = runtime.getCurrentScript();
      log.debug('Remaining governance units: Start ' + scriptObj.getRemainingUsage());
      log.debug("profile start", new Date().getTime())
      if (context.request.method == "GET") {
        var rec_id = context.request.parameters.rec_id;
        var rec_type = context.request.parameters.rec_type;

        setEnv(context);

        var interval = getDiscreteInterval();

        log.debug("wait random interval", interval)

        wait(interval)

        log.debug("wait random interval complete", new Date().getTime())

        var priorityList = getPriorityList();

        log.debug("priorityList", priorityList)

        var proceed_further = false;

        if (priorityList.length == 0) {

          proceed_further = true;

          //if there is no pending que update the  proceed_further

          lockProcess(rec_id);

          log.debug("process locked:" + new Date().getTime(), true)

        }

        while (!proceed_further) {

          log.debug("waiting...", '2s')

          wait(2000)

          priorityList = getPriorityList();

          log.debug("checking que again...", priorityList)

          if (priorityList.length == 0) {

            proceed_further = true;

            log.debug("process locked inside loop:" + new Date().getTime(), true)

            lockProcess(rec_id)
          }
        }

        log.debug("processing starts" + new Date().getTime(), true)
        CUR_REC = record.load({
          type: rec_type,
          id: rec_id,
          isDynamic: true,
        });

        var entity = CUR_REC.getValue("entity");

        var isexclude = CUR_REC.getValue("custbody_cust_pts_pbl_budget_validatio");

        if (entity != "") {
          var isInExcludeList = EXCLUDE_VENDORS.filter(function (c) {
            if (c == entity) {
              return c;
            }
          });

          if (isInExcludeList.length > 0 || ((rec_type == "vendorbill" || rec_type == "purchaseorder") && isexclude == true)) {

            CUR_REC.setValue("custbody_validation_budget_pending", false);
            CUR_REC.setValue("custbody_budget_error", "");
            CUR_REC.save({
              ignoreMandatoryFields: true,
            });
            releaseLock(rec_id)
            redirect.toRecord({
              type: CUR_REC.type,
              id: rec_id,
            });
            return 0;
          }
        }

        var isValPending = CUR_REC.getValue(
          "custbody_validation_budget_pending"
        );

        if (isValPending) {

          updateGlobals(CUR_REC);
          updateOldBudgets();
          validateBudget(CUR_REC);

          var id = CUR_REC.save({
            ignoreMandatoryFields: true,
          });

          releaseLock(rec_id)
        }

        var scriptObj = runtime.getCurrentScript();
        log.debug('Remaining governance units: End ' + scriptObj.getRemainingUsage());


        redirect.toRecord({
          type: CUR_REC.type,
          id: rec_id,
        });

        log.debug("processing complete", new Date().getTime())
      }

    } catch (e) {
      showError("PAGE_INIT_FAILED", e);
      releaseLock(rec_id)
      throw e;
    }
  }


  function releaseLock(rec_id) {
    var currentPriorityRecord = getCurrentRecord(rec_id);

    log.debug("currentPriorityRecord", currentPriorityRecord);

    if (currentPriorityRecord.length > 0) {
      for (var i in currentPriorityRecord) {
        record.delete({
          type: "customrecord_budget_multiple_validation",
          id: currentPriorityRecord[i].id
        })
      }
    }
  }

  function lockProcess(rec_id) {

    var currentPriorityRecord = getCurrentRecord(rec_id);

    log.debug("currentPriorityRecord", currentPriorityRecord);

    if (currentPriorityRecord.length > 0) {
      record.submitFields({
        type: "customrecord_budget_multiple_validation",
        id: currentPriorityRecord[0].id,
        values: {
          "custrecord_processing": true
        }
      });
    }


  }


  function getPriorityList() {

    var type = "customrecord_budget_multiple_validation";

    var filters = [
      ["custrecord_processing", "is", "T"]
    ]

    return getSearch(type, filters, ["custrecord_bmv_transaction_id"])
  }

  function getPriorityList(rec_id) {

    var type = "customrecord_budget_multiple_validation";

    var filters = [

      ["custrecord_processing", "is", "T"]
    ]

    return getSearch(type, filters, ["custrecord_bmv_transaction_id"])
  }

  function getCurrentRecord(rec_id) {


    var type = "customrecord_budget_multiple_validation";

    var filters = [
      [
        [
          "custrecord_bmv_transaction_id", "is", rec_id
        ]
      ],

    ]


    return getSearch(type, filters, ["custrecord_bmv_transaction_id"])

  }


  // function getDiscreteInterval() {

  //   var intervals = [
  //     3300, 3500, 3800, 4000,
  //     0, 300, 600, 900, 1000,
  //     1300, 1500, 1800, 2000,
  //     2300, 2500, 2800, 3000,
  //     4300, 4500, 4800, 5000
  //   ];

  //   var randominterval = getRandomInt(0, 20);

  //   return intervals[randominterval]
  // }

  function getDiscreteInterval() {

    var intervals = [
      4300, 4500, 4800, 5000,
      3300, 3500, 3800, 4000,
      0, 300, 600, 900, 1000,
      1300, 1600, 1800, 2000,
      2300, 2500, 2800, 3000
    ];

    var randominterval = getRandomInt(0, 20);

    return intervals[randominterval]
  }

  function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // function wait(ms) {
  //   var start = new Date().getTime();
  //   var end = start;
  //   while (end < start + ms) {
  //     end = new Date().getTime();
  //   }
  // }



  function wait(ms) {

    var start = new Date().getTime();
    var end = start;
    while (end < start + ms) {
      var employessDummySearch = getSearch("employee", [], [
        "email",
        "firstname",
        "lastname",
        "phone",
        "internalid",
        "accountnumber",
        "altphone",
        "approvallimit",
        "attention",
        "class",
        "entityid",
        "expenselimit",
        "role",
        "shipstate",
        "supervisor",
        "zipcode",
        "shipaddress1",
        "shipaddress2",
        "shipaddress3",
        "billaddress",
        "billaddress1",
        "billaddress2",
        "billaddress3",
        "billaddressee",
        "billcity",
        "billcountry",
        "billcountrycode",
        "billingclass",
        "billphone",
        "billstate",
        "billzipcode",
        "city",
        "birthdate",
        "email",
        "firstname",
        "lastname",
        "phone",
        "internalid"
      ]);

      end = new Date().getTime();
    }
  }

  function validateBudget(curRec) {
    try {
      BACK_TRACK = [];
      RELEASE_LIST = [];
      var isItemValid = false;
      var isExpenseValid = false;

      var lineItems = getLineItems(curRec);

      //include the item details
      updatelineItems(lineItems, curRec);

      log.debug("lineitems", lineItems);
      //validate items
      var response = validateItems(curRec, lineItems);
      if (response.errors.length == 0) {
        isItemValid = true;
        printWarnings(response.warning || []);
      } else {
        printErrors(response.errors);
      }
      var expenseItems = getExpenseList(curRec);
      updateExpenseLines(expenseItems, curRec);
      //validate expense
      var expResponse = validateExpense(curRec, expenseItems);
      if (expResponse.errors.length == 0) {
        isExpenseValid = true;
        printWarnings(expResponse.warning || []);
      } else {
        printErrors(expResponse.errors);
      }
      updateResponseToRecord(response, expResponse, curRec);
      if (isExpenseValid && isItemValid) {
        updateBudgets(curRec);
        handleFinancialYearChange(curRec, lineItems, expenseItems);
        handleLineRemoved(curRec, lineItems, expenseItems);
        releaseBudgets(curRec);
        updatePendingstatus(curRec, lineItems, expenseItems);
        return true;
      } else {
        return false;
      }
    } catch (e) {
      throw e;
      log.debug("main exception error", e);
      showError("SAVE RECORD ERROR", e);
      //throw e;
    }
  }

  function updatePendingstatus(curRec, lineItems, expenseItems) {
    var isPending = false;

    var res = lineItems.filter(function (c, j) {
      if (c.budval_pending) return c;
    });

    var expres = expenseItems.filter(function (c, j) {
      if (c.budval_pending) return c;
    });

    if (res.length > 0 || expres.length > 0) isPending = true;

    curRec.setValue("custbody_validation_budget_pending", isPending);

  }

  function handleLineRemoved(curRec, lineItems, expenseItems) {

    //obvious removal of lines
    if (MODE == "edit") {

      var item_line_count = curRec.getLineCount("item");
      if (item_line_count != ITEM_LIST.length || ITEM_LINES_REM_FLG) {

        if (curRec.type == "purchaseorder") {

          var linked_order = removeNullOrDefault([].concat.apply([], pick(ITEM_LIST, "linkedorder")))

          log.debug("removed line linkedorder", linked_order);

          if (linked_order.length > 0) {
            var req_lines = getTranLines("purchaserequisition", linked_order);
            log.debug("all requistion lines", req_lines);
            for (var i = 0; i < ITEM_LIST.length; i++) {
              var poline = ITEM_LIST[i];
              var prline = req_lines.filter(function (c) {
                if (c.custcol_req_link == poline.custcol_req_link && poline.item == c.item) {
                  return c;
                }
              });
              if (prline.length > 0) {
                poline.prline = prline[0];
              }
            }
          }
        }

        for (var i = 0; i < ITEM_LIST.length; i++) {
          var oldline = ITEM_LIST[i];


          var current_line = lineItems.filter(function (c, j) {
            if (
              c.item == oldline.item &&
              c.custcol_line_unique_key == oldline.custcol_line_unique_key
            )
              return c;
          });

          log.debug('line removed found', current_line);

          if (current_line.length == 0) {
            if (curRec.type == 'purchaseorder') {

              log.debug("po release if direct", true)
              if (oldline.budget && !oldline.linkedorder) {
                RELEASE_LIST.push({
                  budget: oldline.budget.id,
                  oldLine: oldline,
                });
              } else {

                log.debug("old line has prline", oldline.prline);
                //consider the quantity -> zero rate--------> zero
                if (oldline.prline) {
                  var po_rate = 0;
                  var pr_rate = toNum(oldline.prline.estimatedamount) / oldline.prline.quantityuom;
                  var po_qty = 0;
                  var pr_amount = toNum(oldline.prline.estimatedamount);

                  log.debug("po line removed->po_rate", po_rate);
                  log.debug("po line removed->pr_rate", pr_rate);
                  log.debug("po line removed->po_qty", po_qty);


                  var add_release = (po_rate - pr_rate) * po_qty;
                  log.debug("po line removed->Add / (Release):J COL", add_release);


                  var prev_po_consumed = toNum(oldline.custcol_prev_consumed_amt);

                  log.debug("po line removed->Previous PO Consumed Amt", prev_po_consumed);

                  //D+J
                  var curr_po_consumed = pr_amount + add_release;

                  log.debug("po line removed->curr_po_consumed->D+J", curr_po_consumed);

                  //L - k
                  var difference = curr_po_consumed - prev_po_consumed;

                  log.debug("po line removed->final->L - k", difference);

                  var other_charge = 0;

                  var amount = difference + other_charge - toNum(oldline.custcol_other_charges);

                  var remaning_amount = toNum(getBudgetRemaining(oldline));

                  var rem = remaning_amount - amount;

                  log.debug("po line removed->rem", rem);

                  addorUpdate({
                    id: oldline.budget.id,
                    rem: rem,
                    utilised: amount,
                    org_utilised: 0//toNum(oldline.budget.custrecord_utilised_amount),
                  });

                  updateBudgets(curRec);
                }
              }
            }
            else if (curRec.type == "vendorbill") {



              var polineres = PO_DATA.filter(function (c) {

                if (
                  c.custcolpo_link == oldline.custcolpo_link
                  && c.item == oldline.item
                ) {
                  return c;
                }
              });

              log.debug("polineres", polineres)

              if (polineres.length > 0) {
                oldline.poline = polineres[0]
              }

              if (oldline.poline) {
                var vb_rate = 0;
                var po_rate = toNum(oldline.poline.amount) / oldline.poline.quantityuom;
                var vb_qty = 0;
                var po_amount = toNum(oldline.poline.amount);

                log.debug("po line removed->po_rate-309", vb_rate);
                log.debug("po line removed->pr_rate-310", po_rate);
                log.debug("po line removed->po_qty-311", vb_qty);


                var add_release = (vb_rate - po_rate) * vb_qty;
                log.debug("po line removed->Add / (Release):J COL-315", add_release);

                var prev_po_consumed = toNum(oldline.custcol_prev_consumed_amt);

                log.debug("po line removed->Previous PO Consumed Amt-319", prev_po_consumed);

                //D+J
                var curr_po_consumed = po_amount + add_release;

                log.debug("po line removed->curr_po_consumed->D+J-324", curr_po_consumed);

                //L - k
                var difference = curr_po_consumed - prev_po_consumed;

                log.debug("po line removed->final->L - k-329", difference);

                var amount = difference;

                var remaning_amount = toNum(getBudgetRemaining(oldline));

                var rem = remaning_amount - amount;

                log.debug("po line removed->rem - 337", rem);

                addorUpdate({
                  id: oldline.budget.id,
                  rem: rem,
                  utilised: amount,
                  org_utilised: 0//toNum(oldline.budget.custrecord_utilised_amount),
                });

                updateBudgets(curRec);
              } else if (oldline.budget) {
                log.debug("release line", oldline)
                RELEASE_LIST.push({
                  budget: oldline.budget.id,
                  oldLine: oldline,
                });
              }

            }
            else if (oldline.budget) {
              log.debug("vb line removed release line", oldline)
              RELEASE_LIST.push({
                budget: oldline.budget.id,
                oldLine: oldline,
              });
            }
          }
        }
      }
      var expense_line_count = curRec.getLineCount("expense");

      if (expense_line_count != EXPENSE_LIST.length || EXP_LINES_REM_FLG) {
        for (var i = 0; i < EXPENSE_LIST.length; i++) {
          var oldline = EXPENSE_LIST[i];
          var current_line = expenseItems.filter(function (c, j) {
            if (
              c.account == oldline.account &&
              c.custcol_line_unique_key == oldline.custcol_line_unique_key
            )
              return c;
          });


          if (current_line.length == 0) {
            if (oldline.budget)
              RELEASE_LIST.push({
                budget: oldline.budget.id,
                oldLine: oldline,
              });
          }
        }
      }
    }

    //check if it is create and converted po
    if ((MODE == "create" || MODE == "copy") && CNVRT_FROM_PO == true) {
      log.debug("create", "line removed block")
      for (var i = 0; i < PO_DATA.length; i++) {
        var oldline = PO_DATA[i];

        var current_line = lineItems.filter(function (c, j) {
          if (
            c.item == oldline.item &&
            c.custcol_line_unique_key == oldline.custcol_line_unique_key &&
            c.custcolpo_link.split("_")[0] == oldline.id
          )
            return c;
        });

        if (current_line.length > 0) {
          var current_line = current_line[0];
          if (!current_line.ignoreBudget) {
            log.debug("vb->current_line", current_line)

            if (
              current_line.fundCenter.custrecord_fund_center_list_name !=
              oldline.custcol_fund_center_pr ||
              current_line.commitmentItem.id != oldline.custcol_commitment_item_pr
            )
              RELEASE_LIST.push({
                budget: oldline.custcol_budget_line_level,
                oldLine: oldline,
              });
          }
        }
      }
    }

  }

  //pr po vb
  function releaseBudgets(rec) {
    var release_obj = [];

    for (var i = 0; i < RELEASE_LIST.length; i++) {

      var row = RELEASE_LIST[i];

      log.debug('release budget->line', row);

      var exchangerate = rec.getValue("exchangerate")

      if (rec.type == "purchaserequisition") {
        exchangerate = 1;
      }

      var other_charge = 0;

      if (rec.type == "purchaseorder") {
        other_charge = toNum(row.oldLine.custcol_other_charges)
      }

      if (row.hasOwnProperty("rem_qty")) {

        log.debug('if hasOwnProperty - 460', row);

        var amount = ((row.oldLine.amount * exchangerate) / row.oldLine.quantity) * toNum(row.rem_qty);

        release_obj.push({
          id: row.budget,
          amount: amount + other_charge
        });

      }

      else if (row.oldLine.hasOwnProperty("pramount")) {

        log.debug('if hasOwnProperty - 473', row);

        var amount = row.oldLine.pramount;
        log.debug("amount - 476", amount)

        release_obj.push({
          id: row.budget,
          amount: amount
        });

      } else if (row.hasOwnProperty("taxamount")) {

        log.debug('else hasOwnProperty - taxamount ', row);

        release_obj.push({
          id: row.budget,
          amount: ((row.oldLine.amount + row.taxamount) * exchangerate) + other_charge,
        });

      } else {
        log.debug('else hasOwnProperty -485 ', row);

        release_obj.push({
          id: row.budget,
          amount: (row.oldLine.amount * exchangerate) + other_charge,
        });
      }
    }
    var group_budget = groupBy(release_obj, "id");
    log.debug('release->group_budget', group_budget);

    var final_data = [];
    for (var key in group_budget) {
      final_data.push({
        id: key,
        total: roundToTwo(sum(group_budget[key], "amount")),
      });
    }

    rec.setValue({
      fieldId: "custbody_budget_validate_ref",
      value: JSON.stringify({ utilised: BACK_TRACK, release: final_data }),
    });

    var budget_update_data = rec.getValue("custbody_budget_validate_ref");

    log.debug("final_data", budget_update_data);

  }

  function updateBudgets(rec) {
    rec.setValue({
      fieldId: "custbody_budget_validate_ref",
      value: JSON.stringify({ utilised: BACK_TRACK }),
    });
  }

  function validateItems(rec, lines) {
    var result = {
      errors: [],
      warning: [],
    };

    if (lines.length == 0) {
      return result;
    }
    var budgetResponse = getItemBudgets(rec, lines);
    var currency = rec.getValue("currency");
    if (budgetResponse.errors.length > 0) {
      return budgetResponse;
    }

    for (var i = 0; i < lines.length; i++) {
      var line = i + 1;
      var row = lines[i];
      row.i = i;
      log.debug("---->validating for row:" + i, row.item);
      var oldline = {};

      if (row.type == "Discount" || row.ignoreBudget) continue;


      if (MODE == "edit") {
        oldline = geOldSubLine("item", row.custcol_line_unique_key);

        if (!oldline) {
          //old line not found do nothing
        }
        else {
          var financial_year = getFinancialyear(rec.getValue("trandate"));
          var old_financial_year = OLD_FIN_YEAR;
          if (oldline && oldline.isclosed && row.isclosed) {
            log.debug("line is closed->skipping it", i);
            continue;
          }
          //release the budget if the there is a change in the close check box
          if (oldline && !oldline.isclosed && row.isclosed && financial_year == old_financial_year) {
            if (REQ_PO_LINES.length > 0) {

              var po_qty = getQtyRemainingForReq(row) || 0;
              var rem_qty = row.quantity - po_qty;
              //if the line is closed
              if (rem_qty > 0) {
                RELEASE_LIST.push({
                  budget: row.budget.id,
                  oldLine: oldline,
                  rem_qty: rem_qty,
                });
              }
            } else {
              if (rec.type == "purchaseorder") {

                if (toNum(row.quantityreceived) == 0) {

                  //if the row is non deductable gst
                  // row.oldline.amount = row.oldline.amount + row.oldline.taxamount
                  if (oldline.custcol_gst_nature == "Non Deductible") {
                    oldline.amount += oldline.taxamount
                    oldline.amount -= oldline.custcol_tds
                  }

                  if (FIRST_EDIT && currency != INR) {
                    log.debug("FIRST_EDIT", "FIRST_EDIT Triggered")
                    RELEASE_LIST.push({
                      budget: row.budget.id,
                      oldLine: {
                        pramount: row.prline.estimatedamount
                      }
                    });

                  } else {
                    log.debug("else FIRST_EDIT && currency != INR", true)

                    RELEASE_LIST.push({
                      budget: row.budget.id,
                      oldLine: oldline,
                      rem_qty: row.quantity - row.quantityreceived
                    });

                  }
                  continue;
                } else {
                  row.quantity = row.quantityreceived
                }


              } else {
                log.debug('else row->quantity', row.quantity);
                RELEASE_LIST.push({
                  budget: row.budget.id,
                  oldLine: oldline
                });
                continue;
              }
            }
          }

          if (oldline.budget) {
            if (row.budget.id != oldline.budget.id && CNVRT_FROM_PO == false) {
              if (!oldline.isclosed && financial_year == old_financial_year)
                log.debug("!oldline.isclosed && financial_year == old_financial_year", true)
              RELEASE_LIST.push({
                budget: oldline.budget.id,
                oldLine: oldline
              });
            }
          }
        }
      }

      var amount = toNum(getLineAmount(rec, "item", row, lines));
      log.debug("getLineAmount->" + i, amount)

      if (oldline && oldline.isclosed == true && rec.type == "purchaserequisition") {
        log.debug("pr amount re open scenario->amount", amount)
        var po_qty = getQtyRemainingForReq(row) || 0;

        log.debug("pr amount re open scenario->po_qty", po_qty)

        if (row.quantity == po_qty) {
          amount = 0;
        } else {

          log.debug("pr amount re open scenario->row.rate", row.rate)
          if (po_qty == 0) {

            log.debug("pr amount re open do nothing", amount);

          }
          else {
            log.debug("pr amount re open scenario adjust po quantity", amount)
            amount = (amount) - (row.rate * (row.quantity - po_qty))
          }
        }
      }

      log.debug("item->amount", amount);

      var remaning_amount = toNum(getBudgetRemaining(row));

      log.debug("item->remaning_amount", remaning_amount);

      if (amount > remaning_amount) {

        row.budval_pending = true;

        var warning = getWarning(row, line, "item", amount);

        result.errors.push(warning);

        rec.selectLine({
          sublistId: "item",
          line: i,
        });

        rec.setCurrentSublistValue({
          sublistId: "item",
          fieldId: "custcol_budget_validation_pending",
          value: true,
        });

        rec.commitLine({
          sublistId: "item",
        });

        if (oldline) {
          if (oldline.budget)
            RELEASE_LIST.push({
              budget: oldline.budget.id,
              oldLine: oldline,
            });
        }

        if (MODE == "edit") {
          clearCurrentItemLine(rec, i);
        }
        continue;
      } else {
        //do the remaining calc
        var rem = remaning_amount - amount;
        if (rem >= 0) {

          log.debug('prline:' + row.amount, row.prline);

          addorUpdate({
            id: row.budget.id,
            rem: rem,
            utilised: amount,
            org_utilised: 0//toNum(row.budget.custrecord_utilised_amount),
          });
        }

        var utilised_row = BACK_TRACK.filter(function (c) {
          if (c.id == row.budget.id) return c;
        });

        if (utilised_row.length > 0) utilised_row = utilised_row[0];

        rec.selectLine({
          sublistId: "item",
          line: i,
        });

        rec.setCurrentSublistValue({
          sublistId: "item",
          fieldId: "custcol_fund_center_pr",
          value: row.fundCenter.custrecord_fund_center_list_name,
        });

        rec.setCurrentSublistValue({
          sublistId: "item",
          fieldId: "custcol_commitment_item_pr",
          value: row.commitmentItem.id,
        });

        rec.setCurrentSublistValue({
          sublistId: "item",
          fieldId: "custcol_budget_line_level",
          value: row.budget.id,
        });

        rec.setCurrentSublistValue({
          sublistId: "item",
          fieldId: "custcol_amount_not_utilised",
          value: toNum(rem),
        });

        rec.setCurrentSublistValue({
          sublistId: "item",
          fieldId: "custcol_utilized_amount_001",
          value: toNum(toNum(utilised_row.utilised) + toNum(row.budget.custrecord_utilised_amount))
        });

        rec.setCurrentSublistValue({
          sublistId: "item",
          fieldId: "custcol_budget_validation_pending",
          value: false,
        });

        rec.commitLine({
          sublistId: "item",
        });

      }

    }

    if (result.errors.length > 0) {

      PREV_VALUES_TABLE.forEach(function (c, i) {

        rec.selectLine({
          sublistId: c.sublist,
          line: c.line
        });

        rec.setCurrentSublistValue({
          sublistId: c.sublist,
          fieldId: "custcol_prev_consumed_amt",
          value: toNum(c.custcol_prev_consumed_amt)
        });

        rec.commitLine({
          sublistId: c.sublist
        });

      })

    }

    return result;


  }



  function clearCurrentItemLine(rec, i) {
    rec.selectLine({
      sublistId: "item",
      line: i,
    });

    rec.setCurrentSublistValue({
      sublistId: "item",
      fieldId: "custcol_fund_center_pr",
      value: null,
    });

    rec.setCurrentSublistValue({
      sublistId: "item",
      fieldId: "custcol_commitment_item_pr",
      value: null,
    });

    rec.setCurrentSublistValue({
      sublistId: "item",
      fieldId: "custcol_budget_line_level",
      value: null,
    });

    rec.setCurrentSublistValue({
      sublistId: "item",
      fieldId: "custcol_amount_not_utilised",
      value: 0,
    });

    rec.setCurrentSublistValue({
      sublistId: "item",
      fieldId: "custcol_utilized_amount_001",
      value: 0,
    });

    rec.setCurrentSublistValue({
      sublistId: "item",
      fieldId: "custcol_budget_validation_pending",
      value: true,
    });

    rec.commitLine({
      sublistId: "item",
    });
  }

  // function getQtyRemainingForReq(row) {
  //   var res = REQ_PO_LINES.filter(function (c) {
  //     if (c.item == row.item && c.custcol_req_link == row.custcol_req_link)
  //       return c;
  //   });

  //   if (res.length > 0) {
  //     return sum(res, "quantityuom");
  //   } else {
  //     return 0;
  //   }
  // }

  function getQtyRemainingForReq(row) {
    var res = REQ_PO_LINES.filter(function (c) {
      if (c.item == row.item && c.custcol_req_link == row.custcol_req_link)
        return c;
    });

    if (res.length > 0) {
      return sum(res, "quantityuom");
    } else {
      return 0;
    }
  }

  function validateExpense(rec, lines) {
    var result = {
      errors: [],
      warning: [],
    };
    if (lines.length == 0) {
      return {
        errors: [],
        warning: [],
      };
    }
    var budgetResponse = getExpenseBudgets(rec, lines);

    if (budgetResponse.errors.length == 0) {
      for (var i = 0; i < lines.length; i++) {
        var line = i + 1;
        var row = lines[i];
        row.i = i;
        row.line = line;
        log.debug("expense line", row);
        //check if old and current line closed so that we can skip this line
        if (MODE == "edit") {
          var oldline = geOldSubLine("expense", row.custcol_line_unique_key);
          if (oldline && oldline.isclosed && row.isclosed) {
            log.debug("line is closed->skipping it", i);
            continue;
          }

          if (oldline && row.cseg_cost_centre != oldline.cseg_cost_centre) {
            if (!oldline.isclosed)
              RELEASE_LIST.push({
                budget: oldline.budget.id,
                oldLine: oldline,
              });
          }
        }

        var amount = toNum(getLineAmount(rec, "expense", row, lines));

        log.debug("expense amount", amount);


        var remaning_amount = toNum(getBudgetRemaining(row));

        log.debug("expense remaning_amount", remaning_amount);

        //check if the line is closed
        if (MODE == "edit") {
          var oldline = geOldSubLine("expense", row.custcol_line_unique_key);
          //if there is a old line and it is not closed and the current line is closed it refers we need release the amount in the budget
          if (oldline && !oldline.isclosed && row.isclosed) {
            var financial_year = getFinancialyear(rec.getValue("trandate"));
            var old_financial_year = OLD_FIN_YEAR;
            // var old_financial_year = getFinancialyear(
            //   OLD_DATE || rec.getValue("trandate")
            // );

            log.debug("line is closed release the budget amount it on line", i);
            if (financial_year == old_financial_year) {
              RELEASE_LIST.push({ budget: row.budget.id, oldLine: oldline });
              continue;
            }
          }
        }

        if (amount > remaning_amount) {
          row.budval_pending = true;
          var warning = getWarning(row, line, "expense", amount);
          result.errors.push(warning);

          rec.selectLine({
            sublistId: "expense",
            line: i,
          });

          rec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "custcol_budget_validation_pending",
            value: true,
          });

          rec.commitLine({
            sublistId: "expense",
          });

          continue;
        } else {
          //do the remaining calc
          var rem = remaning_amount - amount;

          if (rem >= 0) {

            addorUpdate({
              id: row.budget.id,
              rem: rem,
              utilised: amount,
              org_utilised: 0//toNum(row.budget.custrecord_utilised_amount),
            });
          }

          var utilised_row = BACK_TRACK.filter(function (c) {
            if (c.id == row.budget.id) return c;
          });

          if (utilised_row.length > 0) utilised_row = utilised_row[0];

          rec.selectLine({
            sublistId: "expense",
            line: i,
          });

          rec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "custcol_fund_center_pr",
            value: row.fundCenter.custrecord_fund_center_list_name,
          });

          rec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "custcol_commitment_item_pr",
            value: row.commitmentItem.id,
          });
          rec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "custcol_budget_line_level",
            value: row.budget.id,
          });

          rec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "custcol_amount_not_utilised",
            value: toNum(rem),
          });

          rec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "custcol_utilized_amount_001",
            value: toNum(toNum(utilised_row.utilised) + toNum(row.budget.custrecord_utilised_amount)),
          });

          rec.commitLine({
            sublistId: "expense",
          });
        }
      }
    } else {
      return budgetResponse;
    }
    return result;
  }



  function getWarning(row, line, type, amount) {

    var title = "";
    if (type == "item")
      title =
        "Warn:Budget validation Pending for item " +
        row.item_txt +
        " on line:" +
        line;
    else
      title =
        "Warn:Budget validation Pending for expense " +
        row.account_txt +
        " on line:" +
        line;

    var msg = "The Budget Amount is INR Rs." +
      convertTOINR(toNum(getBudgetRemaining(row))) + "." + "<br/>"

    msg += " Transaction Amount is INR Rs." +
      convertTOINR(toNum(amount)) + "<br/>"

    msg +=
      ". Budget is short by INR Rs." +
      convertTOINR(toNum(amount - getBudgetRemaining(row))) + "." + "<br/>";
    msg += " ";

    msg += "Kindly release more budget before proceeding further."

    var tech_details = "Budget = " + row.budget.id + "</br> ";
    tech_details +=
      "Fund Center =" +
      row.fundCenter.custrecord_fund_center_list_name_txt +
      "</br>";
    tech_details += "Commitment Item = " + row.commitmentItem.name

    var warning = {
      title: title,
      message: msg,
      tech_details: tech_details
    };
    return warning;
  }

  function getExpenseBudgets(rec, explines) {
    var errors = [];
    var budgets = [];
    log.debug("getExpenseBudgets", "<------exp lines----->");
    var cost_center = rec.getValue("cseg_cost_centre");
    var cc_list = pick(explines, "cseg_cost_centre");
    cc_list.push(cost_center);
    cc_list = removeNullOrDefault(cc_list);
    log.debug("cc list", cc_list);
    var trandate = rec.getValue("trandate");
    var financial_year = getFinancialyear(trandate);

    if (!financial_year) {
      errors.push({
        title: "Financial year not found",
        message: "financial year was not found for the transaction date. Please configure the financial year list",
        tech_details: ""
      });
    }

    if (cc_list.length == 0) {
      errors.push({
        title: "cost center not defined on the expense line.",
        message:
          "please select the cost center on line or body level and try again",

        tech_details: ""
      });
    }

    if (errors.length > 0) {
      return {
        errors: errors,
        budgets: budgets,
      };
    }

    var subsidiary = getValue(rec, "subsidiary");
    var fundRes = findFundCenterExpense(subsidiary, cc_list);
    //[sub,cc] or [sub,item,cc]
    for (var i = 0; i < explines.length; i++) {
      var row = explines[i];
      var res = fundRes.filter(function (c) {
        var cc = row.cseg_cost_centre;
        if (!cc) {
          cc = cost_center;
        }

        var cc_center_budget = c.custrecord_cost_center_budget.split(",").map(function (x) {
          return parseInt(x);
        });

        if (cc_center_budget.indexOf(parseInt(cc)) != -1) return c;
      });
      if (res.length > 0) {
        row.fundCenter = res[0];
      } else {
        var msg = ""

        msg += "Fund Centre is missing. Please create following records before proceeding further." + "<br/>";
        msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
        msg += "2. Fund Centre Tagging." + "<br/>";
        msg += "3. Fund Centre to Commitment Item tagging. " + "<br/>";
        msg += "4. Initial Budget" + "<br/>";
        msg += " 5. Release Budget" + "<br/>";


        var techVal = ""
        techVal += "Item = " + row.item_txt + "<br/>"
        techVal += "Line = " + i + "<br/>"
        // techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
        if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
          techVal += "Location = " + row.location_txt
        } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
          // techVal += "Department = " + row.department_txt
        } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
          techVal += "Cost Center = " + row.cseg_cost_centre_txt
        }

        errors.push({
          title: "FUND CENTER NOT FOUND",
          message: msg,
          tech_details: techVal
        });
      }
    }

    var accountList = unique(pick(explines, "account"));
    log.debug("accountList", accountList);
    var cmRes = findCommitmentItems(accountList);
    log.debug("cmRes", cmRes);

    for (var i = 0; i < explines.length; i++) {
      var row = explines[i];
      var res = cmRes.filter(function (c) {
        if (c.custrecord_gl_account.indexOf(row.account) != -1) return c;
      });
      if (res.length > 0) {
        row.commitmentItem = res[0];
      } else {

        var msg = ""
        msg += "Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>"
        msg += " 1. Commitment Item and its Tagging." + "<br/>"
        msg += " 2. Fund Centre to Commitment Item tagging." + "<br/>"
        msg += " 3. Initial Budget." + "<br/>"
        msg += " 4. Release Budget" + "<br/>"

        var techDetaii = ""
        techDetaii += "Account = " + row.account_txt + "<br/>"
        techDetaii += "Line = " + i + "<br/>"
        techDetaii += "Fund Center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "<br/>"
        if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
          techDetaii += "Location = " + row.location_txt
        } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
          //  techDetaii += "Department = " + row.department_txt
        } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
          techDetaii += "Cost Center = " + row.cseg_cost_centre_txt
        }


        errors.push({
          title: "COMMITMENT ITEM NOT FOUND",
          message: msg,
          tech_details: techDetaii
        });
      }
    }
    if (errors.length == 0) {
      log.debug("explines commit and res", explines);
      for (var i = 0; i < explines.length; i++) {
        var row = explines[i];

        if (!row.fundCenter && !row.commitmentItem) {

          var msg = ""

          msg += "Fund Centre and Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>";
          msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
          msg += "2. Fund Centre Tagging." + "<br/>";
          msg += "3.Commitment Item and its Tagging." + "<br/>"
          msg += "4. Fund Centre to Commitment Item tagging. " + "<br/>";
          msg += "5. Initial Budget" + "<br/>";
          msg += " 6. Release Budget" + "<br/>";


          var techVal = ""
          techVal += "Item = " + row.item_txt + "<br/>"
          techVal += "Line = " + i + "<br/>"
          if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
            techVal += "Location = " + row.location_txt
          } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
            //   techVal += "Department = " + row.department_txt
          } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
            techVal += "Cost Center = " + row.cseg_cost_centre_txt
          }
          errors.push({
            title: "FUND CENTER AND COMMITMENT ITEM NOT FOUND",
            message: msg,
            tech_details: techVal
          });

        } else {
          if (!row.fundCenter) {


            var msg = ""

            msg += "Fund Centre is missing. Please create following records before proceeding further." + "<br/>";
            msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
            msg += "2. Fund Centre Tagging." + "<br/>";
            msg += "3. Fund Centre to Commitment Item tagging. " + "<br/>";
            msg += "4. Initial Budget" + "<br/>";
            msg += " 5. Release Budget" + "<br/>";


            var techVal = ""
            techVal += "Item = " + row.item_txt + "<br/>"
            techVal += "Line = " + i + "<br/>"
            techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techVal += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              //  techVal += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techVal += "Cost Center = " + row.cseg_cost_centre_txt
            }

            errors.push({
              title: "FUND CENTER NOT FOUND",
              message: msg,
              tech_details: techVal
            });

          }

          if (!row.commitmentItem) {
            var msg = ""
            msg += "Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>"
            msg += " 1. Commitment Item and its Tagging." + "<br/>"
            msg += " 2. Fund Centre to Commitment Item tagging." + "<br/>"
            msg += " 3. Initial Budget." + "<br/>"
            msg += " 4. Release Budget" + "<br/>"

            var techDetaii = ""
            techDetaii += "Item = " + row.item_txt + "<br/>"
            techDetaii += "Line = " + i + "<br/>"
            techDetaii += "Fund Center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techDetaii += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              //   techDetaii += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techDetaii += "Cost Center = " + row.cseg_cost_centre_txt
            }


            errors.push({
              title: "COMMITMENT ITEM NOT FOUND",
              message: msg,
              tech_details: techDetaii
            });

          }
        }

      }
    }

    if (errors.length == 0) {
      var commitment_items = pick(pick(explines, "commitmentItem"), "id");
      var fundcenter = pick(
        pick(explines, "fundCenter"),
        "custrecord_fund_center_list_name"
      );
      budgets = findBudget(fundcenter, commitment_items, financial_year);
      for (var i = 0; i < explines.length; i++) {
        var row = explines[i];
        var line = i + 1;
        var res = budgets.filter(function (c) {
          if (
            c.custrecord_fund_center_name ==
            row.fundCenter.custrecord_fund_center_list_name &&
            c.custrecord_commitment_item_name == row.commitmentItem.id
          )
            return c;
        });
        if (res.length > 0) row.budget = res[0];
        else {
          var msg = ""

          msg += "Budget not found. Please create following records before proceeding further." + "<br/>"
          msg += "1. Fund Centre to Commitment Item Tagging (if not created before)" + "<br/>"
          msg += "1. Initial Budget." + "<br/>"
          msg += "2. Release Budget"

          var techVal = ""
          techVal += "Account = " + row.account_txt + "<br/>"
          techVal += "Line = " + i + "<br/>"
          techVal += "Fund Center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "<br/>"
          techVal += "Commitment Item = " + row.commitmentItem.name

          errors.push({
            title: "budget not found on the expense line",
            message: msg,
            tech_details: techVal
          });
        }
      }
    }

    if (errors.length > 0) {
      for (var i = 0; i < explines.length; i++) {
        var row = explines[i];
        if (!row.fundCenter || !row.commitmentItem) {
          rec.selectLine({
            sublistId: "expense",
            line: row.line,
          });

          if (!row.fundCenter)
            rec.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "custcol_fund_center_pr",
              value: "",
            });

          if (!row.commitmentItem)
            rec.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "custcol_commitment_item_pr",
              value: "",
            });

          rec.commitLine({
            sublistId: "expense",
          });
        }
      }
    }
    return {
      errors: errors,
      budgets: budgets,
    };
  }

  function findCommitmentItems(accountList) {
    var cm_req = {
      type: "customrecord_coa_commit_items_budget",
      filters: [
        ["isinactive", "is", "F"],
        "AND",
        ["custrecord_gl_account", "anyof", accountList],
      ],
      columns: ["name", "custrecord_gl_account"],
    };

    return getSearch(cm_req.type, cm_req.filters, cm_req.columns);
  }

  function addorUpdate(updaterow) {
    var res = BACK_TRACK.filter(function (c) {
      if (c.id == updaterow.id) return c;
    });

    if (res.length == 0) {
      BACK_TRACK.push({
        id: updaterow.id,
        rem: roundToTwo(updaterow.rem),
        utilised: roundToTwo(updaterow.org_utilised + updaterow.utilised),
      });
    } else {
      res[0].utilised += roundToTwo(updaterow.utilised);
      res[0].rem = roundToTwo(updaterow.rem);
    }
  }

  function getFinancialyear(trandate) {
    //var trandate = rec.getValue("trandate");
    var month = trandate.getMonth();
    var fullyear = parseInt(trandate.getFullYear());
    log.debug("Month:" + month, "Year:" + fullyear);
    //if it is less than april take previous year
    if (month < 3) {
      fullyear -= 1;
    }
    fullyear = fullyear.toString();
    switch (fullyear) {
      // case "2018":
      //   return 1;
      // case "2019":
      //   return 2;
      // case "2020":
      //   return 3;
      // case "2021":
      //   return 4;
      // case "2022":
      //   return 5;
      // case "2023":
      //   return 6;
      case "2024":
        return 1;
      case "2025":
        return 2;
      case "2026":
        return 3;
      case "2027":
        return 4;
      case "2028":
        return 5;
      case "2029":
        return 6;
      case "2030":
        return 7;
      case "2031":
        return 8;
    }
  }

  function getBudgetRemaining(row) {
    var budget = BACK_TRACK.filter(function (c) {
      if (c.id == row.budget.id) {
        return c;
      }
    });

    //check if the same budget is used else where
    if (budget.length == 0 && row.budget) {
      //var budget_amount = toNum( row.budget.custrecord_budget_amount);
      var remaining = toNum(row.budget.custrecord_yet_to_be_utilised);
      log.debug("remaining", remaining);
      return remaining;
    } else if (budget.length > 0) {
      return budget[0].rem;
    } else {
      return 0;
    }
  }

  function getLineAmount(rec, sublist, row, lines) {

    if (rec.type == "purchaserequisition") {
      return getRequisitionAmount(rec, sublist, row);

    } else if (rec.type == "purchaseorder") {

      return getPurchaseOrderAmount(rec, sublist, row, lines)

    } else if (rec.type == "vendorbill") {
      return getVendorBillAmount(rec, sublist, row, lines)
    }

  }

  function getOtherCharges(rec, lines, row) {

    var other_charge = 0;

    var exchangerate = toNumRaw(rec.getValue("exchangerate") || 1);

    log.debug("parent record exchangerates", exchangerate);

    var otherCharges = lines.filter(function (c) {
      if (c.custitemother_charges_service > 0) return c;
    });

    log.debug("otherCharges Lines", otherCharges);

    var nonChargeslines = lines.filter(function (c) {
      if ((c.custitemother_charges_service == "" || !c.custitemother_charges_service) && !c.isclosed)
        return c;
    });

    var partiallyClosedLines = lines.filter(function (c) {
      if (c.isclosed && c.quantityreceived > 0)
        return c;
    });

    log.debug("partiallyClosedLines", partiallyClosedLines)

    var extraLines = partiallyClosedLines.map(function (c) {
      var newobj = Object.assign({}, c);
      newobj.quantity = newobj.quantityreceived;
      newobj.amount = newobj.quantityreceived * newobj.rate;
      return newobj;
    });

    //merge the extra partial lines with non chargelines
    nonChargeslines = nonChargeslines.concat(extraLines);

    log.debug("nonCharges->:item", pick(nonChargeslines, "item"));
    log.debug("nonCharges->:amount", pick(nonChargeslines, "amount"));
    log.debug("nonCharges->:rate", pick(nonChargeslines, "rate"));
    log.debug("nonCharges->:quantity", pick(nonChargeslines, "quantity"));

    var totalSum = sum(nonChargeslines, "amount") * exchangerate;
    log.debug("totalSum", totalSum);

    var cols = [
      "custrecord_net_amount_other_charge",
      "custrecord_other_charge_item",
      "custrecord_rate_of_other_charge",
      "custrecord_po_item",
      "custrecord_po_link",
      "custrecord_hsn_code_for_other_charge",
      "custrecord_tax_amount_other_charge",
      "custrecord_ex_rate",
      "custrecord_currency_other_charge",
      "custrecord_all_items_line",
      "custrecord_same_vendor_line",
      "custrecord_separate_hsn_line"
    ];
    var other_charge_list = getLines(rec, "recmachcustrecord_parent_transaction_link", cols);

    for (var i = 0; i < other_charge_list.length; i++) {
      var oc_row = other_charge_list[i];

      log.debug("oc_row", oc_row);

      var exchangerate = 1; // INR

      if (isNullorDefault(oc_row.custrecord_ex_rate)) {
        // currency of the PO usr inr 
        exchangerate = toNumRaw(rec.getValue("exchangerate"));

      } else {
        exchangerate = toNumRaw(oc_row.custrecord_ex_rate);
      }

      if (!isNullorDefault(oc_row.custrecord_ex_rate)) {
        exchangerate = toNum(oc_row.custrecord_ex_rate)
      }

      log.debug("othercharges exchangerate", exchangerate);

      oc_row.custrecord_net_amount_other_charge = exchangerate * oc_row.custrecord_net_amount_other_charge

      log.debug("oc_row.custrecord_net_amount_other_charge", oc_row.custrecord_net_amount_other_charge);
    }

    log.debug("other_charge_list", other_charge_list);

    var all_items_charge_list = other_charge_list.filter(function (c) {
      if (c.custrecord_all_items_line) {
        return c;
      }
    });

    if (all_items_charge_list.length > 0) {

      log.debug("othertotal->sum", pick(all_items_charge_list, "custrecord_net_amount_other_charge"));

      var othertotal = sum(all_items_charge_list, "custrecord_net_amount_other_charge");

      log.debug("othertotal", othertotal);

      other_charge = (row.rate * row.quantity * othertotal) / totalSum;

      log.debug("othercharge before multiply", other_charge)

      log.debug("othercharge parent exchange rate", rec.getValue("exchangerate"))

      other_charge = other_charge * toNumRaw(rec.getValue("exchangerate"))

      log.debug("other after multiply charges calc", other_charge);

    }

    var current_oc_list = other_charge_list.filter(function (c) {
      //othercharge
      if (c.custrecord_po_item == row.item && !c.custrecord_all_items_line) {
        return c;
      }
    });

    if (current_oc_list.length > 0) {

      log.debug("current_oc_list", current_oc_list);

      var oc_amt = sum(current_oc_list, "custrecord_net_amount_other_charge");

      log.debug("oc_amt", oc_amt);

      var perlines = lines.filter(function (c) {
        if (c.item == row.item) return c;
      });

      other_charge += (oc_amt / perlines.length);

      log.debug("other charges calc", other_charge);

    }

    if (other_charge > 0) {
      rec.selectLine({
        sublistId: "item",
        line: row.index,
      });

      rec.setCurrentSublistValue({
        sublistId: "item",
        fieldId: "custcol_other_charges",
        value: toNum(other_charge),
      });

      rec.commitLine({
        sublistId: "item",
      });
    }

    return other_charge;
  }

  function getPurchaseOrderAmount(rec, sublist, row, lines) {

    switch (sublist) {
      case "item":
        return getItemSublistAmountForPO(rec, row, lines);
      case "expense":
        return getExpenseSublistAmountForPO(rec, row);
    }
  }


  function getItemSublistAmountForPO(rec, row, lines) {

    var exchangerate = toNumRaw(rec.getValue("exchangerate"));

    var res = ITEM_LIST.filter(function (c) {
      if (c.item == row.item && isBudgetParamSame(rec, row, c))
        return c;
    });

    log.debug("po old line", res);

    var other_charge = getOtherCharges(rec, lines, row);

    if (res.length == 0) {


      // if(row.custcol_gst_nature == "Non Deductible"){
      //   return (row.amount * exchangerate) + other_charge + row.taxamount;
      // } else{
      //   return (row.amount * exchangerate) + other_charge;
      // }
      if (row.custcol_gst_nature == "Non Deductible") {
        log.debug("coming Inside dir po", "Non-dec coming inside dir po");
        row.amount += toNum(row.taxamount);
        row.amount -= toNum(row.custcol_tds);
      }

      return (row.amount * exchangerate) + other_charge;
    }
    else {

      //if it is a converted po
      if (row.linkedorder > 0) {

        //(PO_RATE - PR_RATE)*PO_QTY
        var po_rate = toNum(row.rate) * exchangerate;
        var pr_rate = toNum(row.prline.estimatedamount) / row.prline.quantityuom;
        var po_qty = toNum(row.quantity);
        var pr_amount = toNum(row.prline.estimatedamount);

        if (row.isclosed == true) {
          pr_amount = po_qty * pr_rate
        }

        log.debug("po line->po_rate", po_rate);
        log.debug("po line->pr_rate", pr_rate);
        log.debug("po line->po_qty", po_qty);

        var add_release = (po_rate - pr_rate) * po_qty;

        log.debug("Add / (Release):J COL", add_release);

        var prev_po_consumed = toNum(row.custcol_prev_consumed_amt)

        PREV_VALUES_TABLE.push({
          custcol_prev_consumed_amt: new Number(prev_po_consumed),
          sublist: "item",
          line: row.i
        })

        log.debug("Previous PO Consumed Amount", prev_po_consumed);

        var curr_po_consumed = pr_amount + add_release;
        //D+J
        if (row.custcol_gst_nature == "Non Deductible") {
          curr_po_consumed += toNum(row.taxamount)
          curr_po_consumed -= toNum(row.custcol_tds);
        }


        updatePreviousConsumedLine(rec, "item", row.i, curr_po_consumed);

        log.debug("curr_po_consumed->D+J", curr_po_consumed);


        //L - k
        var difference = curr_po_consumed - prev_po_consumed;

        log.debug("difference->L - k- PO - 1530", difference);

        log.debug("toNum(row.taxamount)", toNum(row.taxamount));

        log.debug("toNum(res[0].taxamount)", toNum(res[0].taxamount))

        log.debug("difference + other_charge - res[0].custcol_other_charges + row.taxamount - res[0].taxamount",
          difference + other_charge - toNum(res[0].custcol_other_charges) + toNum(row.taxamount) - toNum(res[0].taxamount))

        log.debug(" row.amount - res[0].amount + other_charge - toNum(res[0].custcol_other_charges) + toNum(row.taxamount) - toNum(res[0].taxamount)",

          row.amount - res[0].amount + other_charge - toNum(res[0].custcol_other_charges) + toNum(row.taxamount) - toNum(res[0].taxamount))

        return difference + other_charge - toNum(res[0].custcol_other_charges)

      } else if (row.amount != res[0].amount && isNullorDefault(row.linkedorder)) {
        //direct po
        if (row.custcol_gst_nature == "Non Deductible") {
          log.debug("coming Inside dir po", "Non-dec coming inside dir po")
          return row.amount - res[0].amount + other_charge - toNum(res[0].custcol_other_charges) - toNum(res[0].taxamount) + toNum(res[0].custcol_tds) //some changes
        } else {
          return row.amount - res[0].amount + other_charge - toNum(res[0].custcol_other_charges)
        }

      }
      else {
        return other_charge - toNum(res[0].custcol_other_charges);
      }
    }

  }

  function updatePreviousConsumedLine(rec, sublist, line, value) {
    rec.selectLine({
      sublistId: sublist,
      line: line
    })

    rec.setCurrentSublistValue({
      sublistId: sublist,
      fieldId: "custcol_prev_consumed_amt",
      value: toNum(value)
    })

    rec.commitLine({
      sublistId: sublist
    });

  }

  function getExpenseSublistAmountForPO(rec, row) {
    var exchangerate = toNumRaw(rec.getValue("exchangerate"));

    if (row.linkedorder > 0) {

      //(PO_RATE - PR_RATE)*PO_QTY
      var po_rate = toNum(row.amount) * exchangerate;
      var pr_rate = toNum(row.prline.estimatedamount);
      // var po_qty = toNum(row.quantity);
      var pr_amount = toNum(row.prline.estimatedamount);

      if (row.isclosed == true) {
        pr_amount = pr_rate
      }

      log.debug("po line->po_rate", po_rate);
      log.debug("po line->pr_rate", pr_rate);
      // log.debug("po line->po_qty", po_qty);

      var add_release = (po_rate - pr_rate);

      log.debug("Add / (Release):J COL", add_release);

      var prev_po_consumed = toNum(row.custcol_prev_consumed_amt)

      PREV_VALUES_TABLE.push({
        custcol_prev_consumed_amt: new Number(prev_po_consumed),
        sublist: "expense",
        line: row.i
      });

      log.debug("Previous PO expense Consumed Amount", prev_po_consumed);

      var curr_po_consumed = pr_amount + add_release;
      //D+J
      if (row.custcol_gst_nature == "Non Deductible") {
        curr_po_consumed += toNum(row.taxamount)
        curr_po_consumed -= toNum(row.custcol_tds);
      }

      updatePreviousConsumedLine(rec, "expense", row.i, curr_po_consumed);

      log.debug("curr_po_consumed->D+J", curr_po_consumed);

      //L - k
      var difference = curr_po_consumed - prev_po_consumed;

      log.debug("difference->L - k- PO - 1530", difference);

      //log.debug("toNum(row.taxamount)", toNum(row.taxamount));

      // log.debug("toNum(res[0].taxamount)", toNum(res[0].taxamount))

      return difference

    } else {

      var res = EXPENSE_LIST.filter(function (c) {
        if (c.account == row.account && isBudgetParamSame(rec, row, c))
          return c;
      });


      if (res.length == 0)
        return row.amount * exchangerate;
      else {
        return (row.amount * exchangerate) - (res[0].amount * OLD_EXCHANGE_RATE);
      }
    }
  }


  function getRequisitionAmount(rec, sublist, row) {

    var amount = 0;

    if (MODE == "create" || MODE == "copy") {
      return row.estimatedamount;
    } else {
      if (sublist == "item") {

        var res = ITEM_LIST.filter(function (c) {
          if (c.custcol_line_unique_key == row.custcol_line_unique_key && isBudgetParamSame(rec, row, c))
            return c;
        });

        log.debug("getRequisitionAmount->res", res)

        if (res.length == 0)
          amount = row.estimatedamount;
        else
          amount = row.estimatedamount - res[0].estimatedamount;

      } else {

        var res = EXPENSE_LIST.filter(function (c) {
          if (c.account == row.account && isBudgetParamSame(rec, row, c))
            return c;
        });
        if (res.length == 0)
          amount = row.estimatedamount;
        else
          amount = row.estimatedamount - res[0].estimatedamount;

      }
    }

    return amount;

  }


  function getVendorBillAmount(rec, sublist, row) {

    if ((MODE == "create" || MODE == "copy") && !CNVRT_FROM_PO) {

      var exchangerate = toNumRaw(rec.getValue("exchangerate"))
      log.debug("direct bill")
      if (row.custcol_gst_nature == "Non Deductible") {
        return (row.amount + row.taxamount - row.custcol_tds) * exchangerate;
      } else {
        return row.amount * exchangerate;
      }
    } else {
      if (sublist == "item") {
        return getVBItemAmount(rec, row);
      } else {
        return getVBExpenseAmount(rec, row);
      }
    }
  }


  function getVBItemAmount(rec, row) {
    if (row.poline) {
      log.debug("vb line->poline", row.poline);
      log.debug("vb line->line", row);
      var exchangerate = toNumRaw(rec.getValue("exchangerate"))
      var vb_rate = toNum(row.rate) * exchangerate;
      var po_rate = toNum(row.poline.amount) / row.poline.quantityuom;
      var vb_qty = toNum(row.quantity);
      var po_amount = toNum(row.poline.amount);
      var po_taxAmount = toNum(row.poline.taxamount)

      log.debug("vb line->raw_vb_rate", row.rate);

      if (row.custcol_gst_nature == "Non Deductible") {

        log.debug("Non Deductible->row.netamount", row.netamount);
        log.debug("Non Deductible->row.quantity", row.quantity);
        log.debug("Non Deductible->exchangerate", exchangerate);

        po_rate = toNum(row.poline.netamount) / row.poline.quantityuom;
        vb_rate = ((toNum(row.taxamount) - toNum(row.custcol_tds) + toNum(row.amount)) / row.quantity) * exchangerate;
        po_amount = toNum(row.poline.netamount);
      }

      log.debug("vb line->po_rate", po_rate);
      log.debug("vb line->vb_rate", vb_rate);

      log.debug("vb line->vb_qty", vb_qty);

      var add_release = (vb_rate - po_rate) * vb_qty;

      log.debug("Add / (Release):J COL", add_release);

      var prev_vb_consumed = toNum(row.custcol_prev_consumed_amt)

      if (row.poline && isNullorDefault(row.custcol_prev_consumed_amt)) {
        prev_vb_consumed = po_amount;
      }

      PREV_VALUES_TABLE.push({
        custcol_prev_consumed_amt: new Number(prev_vb_consumed),
        sublist: "item",
        line: row.i
      })

      log.debug("Previous VB Consumed Amount", prev_vb_consumed);

      //D+J
      var curr_vb_consumed = po_amount + add_release;

      updatePreviousConsumedLine(rec, "item", row.i, curr_vb_consumed);

      log.debug("curr_vb_consumed->D+J", curr_vb_consumed);

      //L - k
      var difference = curr_vb_consumed - prev_vb_consumed;

      log.debug("difference->L - k", difference);

      return difference;

    } else {

      var exchangerate = toNumRaw(rec.getValue("exchangerate"));

      log.debug("poline not exchangerate ", exchangerate)

      log.debug("poline not found ", true)

      var res = ITEM_LIST.filter(function (c) {
        if (c.item == row.item && isBudgetParamSame(rec, row, c))
          return c;
      });
      log.debug("poline not res ", res)

      if (res.length == 0) {
        log.debug("res if", res)
        amount = row.amount * exchangerate;
      }
      else {
        log.debug("row if row", row)
        log.debug("res if res", res)
        log.debug("res if OLD_EXCHANGE_RATE", OLD_EXCHANGE_RATE)
        amount = (row.amount * exchangerate) - (res[0].amount * OLD_EXCHANGE_RATE);
      }

      if (row.custcol_gst_nature == "Non Deductible") {

        amount = amount + toNum(row.taxamount) - toNum(row.custcol_tds) - toNum(res[0]?.taxamount) + toNum(res[0]?.custcol_tds)
      } else {

      }
      return amount;
    }

  }

  function getVBExpenseAmount(rec, row) {

    if (row.poline) {
      log.debug("vb expense line->poline", row.poline);
      log.debug("vb expense line->line", row);

      var exchangerate = toNumRaw(rec.getValue("exchangerate"))
      var vb_rate = toNum(row.amount) * exchangerate;
      var po_rate = toNum(row.poline.amount)
      var po_amount = toNum(row.poline.amount);

      log.debug("vb line->expense->po_rate", po_rate);
      log.debug("vb line->expense->vb_rate", vb_rate);
      var add_release = (vb_rate - po_rate);

      log.debug("expense Add / (Release):J COL", add_release);

      var prev_vb_consumed = toNum(row.custcol_prev_consumed_amt)

      if (row.poline && isNullorDefault(row.custcol_prev_consumed_amt)) {
        prev_vb_consumed = po_amount;
      }

      PREV_VALUES_TABLE.push({
        custcol_prev_consumed_amt: new Number(prev_vb_consumed),
        sublist: "expense",
        line: row.i
      })

      log.debug("Previous VB expense Consumed Amount", prev_vb_consumed);

      //D+J
      var curr_vb_consumed = po_amount + add_release;

      updatePreviousConsumedLine(rec, "expense", row.i, curr_vb_consumed);

      log.debug("expense curr_vb_consumed->D+J", curr_vb_consumed);

      //L - k
      var difference = curr_vb_consumed - prev_vb_consumed;

      log.debug("expense difference->L - k", difference);

      return difference;

    } else {
      var exchangerate = toNumRaw(rec.getValue("exchangerate"));

      log.debug("previous expense list", EXPENSE_LIST)

      var res = EXPENSE_LIST.filter(function (c) {
        log.debug("expense->c", c);
        log.debug("expense->row", row);
        if (c.account == row.account && isBudgetParamSame(rec, row, c))
          return c;
      });

      log.debug("expense previous row", res)

      if (res.length == 0)
        return row.amount * exchangerate;
      else
        return (row.amount * exchangerate) - (res[0].amount * OLD_EXCHANGE_RATE);
    }

  }


  function isBudgetParamSame(rec, row, compareRow) {
    var currentDate = rec.getValue("trandate");
    var financial_year = getFinancialyear(currentDate);
    var old_financial_year = OLD_FIN_YEAR  //getFinancialyear(OLD_DATE || currentDate);

    // log.debug("isBudgetParamSame->currentDate", currentDate);
    // log.debug("isBudgetParamSame->old_financial_year", old_financial_year);
    // log.debug("isBudgetParamSame->financial_year", financial_year);


    // log.debug("isBudgetParamSame->old_financial_year", old_financial_year);


    // log.debug("compareRow.custcol_line_unique_key", compareRow.custcol_line_unique_key);
    // log.debug("row.custcol_line_unique_key", row.custcol_line_unique_key);

    // log.debug("isBudgetParamSame->custcol_commitment_item_pr", compareRow.custcol_commitment_item_pr);


    if (compareRow.custcol_line_unique_key == row.custcol_line_unique_key &&
      compareRow.custcol_commitment_item_pr == row.commitmentItem.id &&
      compareRow.custcol_fund_center_pr == row.fundCenter.custrecord_fund_center_list_name &&
      financial_year == old_financial_year &&
      !compareRow.isclosed) {
      log.debug("isBudgetParamSame", true);
      return true;
    }

    else {
      log.debug("isBudgetParamSame", true);
      return false;
    }

  }

  function getItemBudgets(rec, lines) {

    lines = lines.filter(function (c) {
      if (c.type != "Discount") return c;
    });

    lines = lines.filter(function (c) {
      if (c.ignoreBudget == false) return true;
    });

    log.debug("get Item Budgets", lines);
    var group_item = groupBy(lines, "custcol_budget_item_type");
    log.debug("group_item", group_item);
    var response = [];
    var errors = [];
    for (var key in group_item) {
      var items_list = group_item[key];
      switch (key) {
        case "1":
          var res = findBudgetUsingItem(rec, items_list);
          log.debug("get using item res", res);
          if (res.errors.length > 0) errors = errors.concat(res.errors);
          else response = response.concat(res.budgets);
          break;

        case "2":
          var res = findBudgetUsingItemCategory(rec, items_list);
          log.debug("get using department and location", res);
          if (res.errors.length > 0) errors = errors.concat(res.errors);
          else response = response.concat(res.budgets);
          break;

        case "3":
          var res = findBudgetUsingCostCenter(rec, items_list);
          log.debug("get using Cost Center", res);
          if (res.errors.length > 0) errors = errors.concat(res.errors);
          else response = response.concat(res.budgets);
          break;

        case "4":
          var res = findBudgetUsingCostCenter(rec, items_list);
          log.debug("get using Cost Center", res);
          if (res.errors.length > 0) errors = errors.concat(res.errors);
          else response = response.concat(res.budgets);
          break;

        case "5":
          var res = findBudgetUsingProjectTask(rec, items_list);
          log.debug("get using project task", res);
          if (res.errors.length > 0)
            errors = errors.concat(res.errors);
          break;
        default:
          errors.push({
            title: "Invalid budget item type.",
            message: "please select supported item budget type",
            tech_details: " "
          });
          break;
      }
    }

    if (errors.length > 0) {
      for (var i = 0; i < lines.length; i++) {
        var row = lines[i];

        if (!row.fundCenter || !row.commitmentItem) {
          rec.selectLine({
            sublistId: "item",
            line: row.line,
          });

          if (!row.fundCenter)
            rec.setCurrentSublistValue({
              sublistId: "item",
              fieldId: "custcol_fund_center_pr",
              value: "",
            });

          if (!row.commitmentItem)
            rec.setCurrentSublistValue({
              sublistId: "item",
              fieldId: "custcol_commitment_item_pr",
              value: "",
            });

          rec.commitLine({
            sublistId: "item",
          });

        }
      }
    }

    return {
      response: response,
      errors: errors,
    };
  }

  function findBudgetUsingItem(rec, lines) {
    var errors = [];
    var budgets = [];
    var subsidiary = getValue(rec, "subsidiary");
    var items = pick(lines, "item");
    var location = pick(lines, "location");
    var loc_res = location.filter(function (c) {
      if (c != "" && c != null && c != undefined) return c;
    });

    var loc = rec.getValue("location") || "";
    if (loc_res.length == 0 && !isNullorDefault(loc)) {
      loc_res = [loc];
    }
    if (loc_res.length == 0) {
      errors.push({
        title: "Location not defined on both line and body level",
        message: "please select the location",
        tech_details: ""
      });
    }

    var parents = loc_res.map(function (c) {
      //include parent location as well
      var parent_res = LOCATION_LIST.filter(function (curloc) {
        if (c == curloc.id) return c;
      });

      if (
        parent_res.length > 0 &&
        parent_res[0].custrecord_parent_budget == true
      )
        return pick(parent_res[0].parent, "id");
    });

    var flat_parents = removeNullOrDefault([].concat.apply([], parents));

    loc_res = loc_res.concat(flat_parents);

    log.debug("location with its parents", loc_res);

    var trandate = rec.getValue("trandate");
    var financial_year = getFinancialyear(trandate);

    if (!financial_year) {
      errors.push({
        title: "Financial year not found",
        message: "please select trandate or financial year not configured",
        tech_details: ""
      });
    }
    if (errors.length > 0) {
      return {
        errors: errors,
        budgets: [],
      };
    }
    var req = {
      type: "customrecord_fund_center_budget",
      filters: [
        ["isinactive", "is", false],
        "AND",
        ["custrecord_subsidiary_budget", "anyof", subsidiary],
        "AND",
        ["custrecord_item_budget", "anyof", items],
        "AND",
        ["custrecord_location_budget", "anyof", loc_res],
      ],
      columns: [
        "custrecord_subsidiary_budget",
        "custrecord_item_budget",
        "custrecord_fund_center_list_name",
        "custrecord_location_budget",
        "custrecord_cost_center_budget",
        "custrecord_deparment_tagging",
      ],
    };
    var fundRes = getSearch(req.type, req.filters, req.columns);

    log.debug("findBudgetUsingItem->fundRes", fundRes)

    if (fundRes.length == 0) {

    }

    for (var i = 0; i < lines.length; i++) {
      var line_ui = i + 1;
      var row = lines[i];
      if (isNullorDefault(row.location)) row.location = loc;

      var parent_loc = LOCATION_LIST.filter(function (c) {
        if (c.id == row.location && c.custrecord_parent_budget == true)
          return c;
      });

      if (parent_loc.length > 0) {
        row.parent_location = pick(parent_loc[0].parent, "id");
      } else {
        row.parent_location = [];
      }

      var res = fundRes.filter(function (c) {
        if (
          c.custrecord_item_budget == row.item &&
          row.location == c.custrecord_location_budget
        )
          return c;
      });

      if (res.length == 0) {
        res = fundRes.filter(function (c) {
          if (
            c.custrecord_item_budget == row.item &&
            isFound(c.custrecord_location_budget, row.parent_location)
          )
            return c;
        });
      }

      if (res.length > 0) {
        row.fundCenter = res[0];
      } else {
      }
    }
    //directly taking the account field for all lines because expense vs asset is handled on basis of item type already
    var accountList = pick(lines, "account");
    var cmRes = findCommitmentItems(accountList);

    log.debug("findBudgetUsingItem->commitment", cmRes)

    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];
      var res = cmRes.filter(function (c) {
        if (c.custrecord_gl_account.indexOf(row.account) != -1) return c;
      });
      if (res.length > 0) {
        row.commitmentItem = res[0];
      }
    }
    log.debug("new updated lines", lines);
    //check for commitment and fund center for all lines exist or not
    var excludeList = ["12345"];
    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];
      log.debug("FUNDCENTER/COMMITMENT->row", row);
      if (row.type != "Discount" && excludeList.indexOf(row.item) == -1) {


        if (!row.fundCenter && !row.commitmentItem) {

          var msg = ""

          msg += "Fund Centre and Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>";
          msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
          msg += "2. Fund Centre Tagging." + "<br/>";
          msg += "3.Commitment Item and its Tagging." + "<br/>"
          msg += "4. Fund Centre to Commitment Item tagging. " + "<br/>";
          msg += "5. Initial Budget" + "<br/>";
          msg += " 6. Release Budget" + "<br/>";


          var techVal = ""
          techVal += "Item = " + row.item_txt + "<br/>"
          techVal += "Line = " + i + "<br/>"
          if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
            techVal += "Location = " + row.location_txt
          } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
            //  techVal += "Department = " + row.department_txt
          } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
            techVal += "Cost Center = " + row.cseg_cost_centre_txt
          }
          errors.push({
            title: "FUND CENTER AND COMMITMENT ITEM NOT FOUND",
            message: msg,
            tech_details: techVal
          });

        } else {
          if (!row.fundCenter) {


            var msg = ""

            msg += "Fund Centre is missing. Please create following records before proceeding further." + "<br/>";
            msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
            msg += "2. Fund Centre Tagging." + "<br/>";
            msg += "3. Fund Centre to Commitment Item tagging. " + "<br/>";
            msg += "4. Initial Budget" + "<br/>";
            msg += " 5. Release Budget" + "<br/>";


            var techVal = ""
            techVal += "Item = " + row.item_txt + "<br/>"
            techVal += "Line = " + i + "<br/>"
            techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techVal += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              // techVal += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techVal += "Cost Center = " + row.cseg_cost_centre_txt
            }

            errors.push({
              title: "FUND CENTER NOT FOUND",
              message: msg,
              tech_details: techVal
            });

          }

          if (!row.commitmentItem) {
            var msg = ""
            msg += "Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>"
            msg += " 1. Commitment Item and its Tagging." + "<br/>"
            msg += " 2. Fund Centre to Commitment Item tagging." + "<br/>"
            msg += " 3. Initial Budget." + "<br/>"
            msg += " 4. Release Budget" + "<br/>"

            var techDetaii = ""
            techDetaii += "Item = " + row.item_txt + "<br/>"
            techDetaii += "Line = " + i + "<br/>"
            techDetaii += "Fund Center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techDetaii += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              //  techDetaii += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techDetaii += "Cost Center = " + row.cseg_cost_centre_txt
            }


            errors.push({
              title: "COMMITMENT ITEM NOT FOUND",
              message: msg,
              tech_details: techDetaii
            });

          }
        }


      }
    }

    if (errors.length == 0) {
      var commitment_items = pick(pick(lines, "commitmentItem"), "id");
      var commitment_items_names = pick(pick(lines, "commitmentItem"), "name");
      var fundcenter = pick(
        pick(lines, "fundCenter"),
        "custrecord_fund_center_list_name"
      );

      var fundcenter_names = pick(
        pick(lines, "fundCenter"),
        "custrecord_fund_center_list_name_txt"
      );
      budgets = findBudget(fundcenter, commitment_items, financial_year);

      log.debug("updated budgets", budgets);

      for (var i = 0; i < lines.length; i++) {
        var row = lines[i];

        log.debug("find budget for row", row);

        var res = budgets.filter(function (c) {
          if (
            c.custrecord_fund_center_name ==
            row.fundCenter.custrecord_fund_center_list_name &&
            c.custrecord_commitment_item_name == row.commitmentItem.id
          )
            return c;
        });

        log.debug("find for res", res);

        if (res.length > 0) {
          row.budget = res[0];
        }
        else {
          var ff_msg = row.fundCenter.custrecord_fund_center_list_name_txt
          var cc_msg = row.commitmentItem.name

          var msg = ""
          msg += "Budget not found. Please create following records before proceeding further." + "<br/>"
          msg += "1.Fund Centre to Commitment Item Tagging (if not created before)" + "<br/>"
          msg += " 2. Initial Budget." + "<br/>"
          msg += " 3. Release Budget" + "<br/>"


          var techDetails = ""
          techDetails += "\n Item = " + row.item_txt + "<br/>"
          techDetails += "\nFund Center = " + ff_msg + "</br> "
          techDetails += "\nCommitment Item = " + cc_msg


          errors.push({
            title: "Budget not Found",
            message: msg,
            tech_details: techDetails
          });
        }
      }
    }
    return {
      errors: errors,
      budgets: budgets,
    };
  }

  function findBudgetUsingItemCategory(rec, lines) {
    var errors = [];
    var budgets = [];
    var subsidiary = getValue(rec, "subsidiary");
    var category = removeNullOrDefault(pick(lines, "custitem_item_category"));

    var items = pick(lines, "item");


    var location = pick(lines, "location");
    var loc_res = location.filter(function (c) {
      if (c != "" && c != null && c != undefined) return c;
    });
    var loc = rec.getValue("location") || "";
    if (loc_res.length == 0 && !isNullorDefault(loc)) {
      loc_res = [loc];
    }
    if (loc_res.length == 0) {
      errors.push({
        title: "Location not defined on both line and body level",
        message: "please select the location",
        tech_details: ""
      });
    }

    var parents = loc_res.map(function (c) {
      //include parent location as well
      var parent_res = LOCATION_LIST.filter(function (curloc) {
        if (c == curloc.id) return c;
      });

      if (
        parent_res.length > 0 &&
        parent_res[0].custrecord_parent_budget == true
      )
        return pick(parent_res[0].parent, "id");
    });

    var flat_parents = removeNullOrDefault([].concat.apply([], parents));

    loc_res = loc_res.concat(flat_parents);

    log.debug("location with its parents", loc_res);

    var trandate = rec.getValue("trandate");

    var financial_year = getFinancialyear(trandate);

    if (!financial_year) {
      errors.push({
        title: "Financial year not found",
        message: "please select trandate or financial year not configured",
        tech_details: ""
      });
    }

    if (errors.length > 0) {
      return {
        errors: errors,
        budgets: [],
      };
    }

    var req = {
      type: "customrecord_fund_center_budget",
      filters: [
        ["isinactive", "is", false],
        "AND",
        ["custrecord_subsidiary_budget", "anyof", subsidiary],
        "AND",
        [
          [
            ["custrecord_fct_item_category", "anyof", category],
            "AND",
            ["custrecord_location_budget", "anyof", loc_res]
          ],
          "OR",
          ["custrecord_item_budget", "anyof", items]
        ]
      ],
      columns: [
        "custrecord_subsidiary_budget",
        "custrecord_item_budget",
        "custrecord_fund_center_list_name",
        "custrecord_location_budget",
        "custrecord_cost_center_budget",
        "custrecord_deparment_tagging",
        "custrecord_location_budget",
        "custrecord_fct_item_category"
      ],
    };

    log.debug("FundReq==>", req);

    var fundRes = getSearch(req.type, req.filters, req.columns);
    log.debug("FundRes==>", fundRes);
    var ids = pick(fundRes, "id");

    log.debug("fund->ids", ids);

    if (fundRes.length == 0) {

    }

    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];

      if (isNullorDefault(row.location)) row.location = loc;

      var parent_loc = LOCATION_LIST.filter(function (c) {
        if (c.id == row.location && c.custrecord_parent_budget == true)
          return c;
      });

      if (parent_loc.length > 0) {
        row.parent_location = pick(parent_loc[0].parent, "id");
      } else {
        row.parent_location = [];
      }

      //check for item and item category

      var res = fundRes.filter(function (c) {
        if (c.custrecord_fct_item_category == row.custitem_item_category &&
          row.item == c.custrecord_item_budget &&
          row.location == c.custrecord_location_budget)
          return c;
      });

      //check for item  and item category

      if (res.length == 0) {
        res = fundRes.filter(function (c) {
          if (c.custrecord_fct_item_category == row.custitem_item_category &&
            row.item == c.custrecord_item_budget &&
            isFound(c.custrecord_location_budget, row.parent_location))
            return c;
        });
      }

      //look for dept with item tagging
      if (res.length == 0) {
        res = fundRes.filter(function (c) {
          if (
            c.custrecord_fct_item_category == row.custitem_item_category &&
            row.location == c.custrecord_location_budget
            &&
            isNullorDefault(c.custrecord_item_budget)
          )
            return c;
        });
      }

      if (res.length == 0) {
        res = fundRes.filter(function (c) {
          // if (isNullorDefault(row.department)) row.department = body_department;
          if (
            c.custrecord_fct_item_category == row.custitem_item_category &&
            isFound(c.custrecord_location_budget, row.parent_location)
            &&
            isNullorDefault(c.custrecord_item_budget)
          )
            return c;
        });
      }

      if (res.length > 0) {
        row.fundCenter = res[0];
      }
    }
    var accountList = pick(lines, "account");
    var cmRes = findCommitmentItems(accountList);
    log.debug("fundRes", fundRes);
    log.debug("cmRes", cmRes);

    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];
      var res = cmRes.filter(function (c) {
        if (c.custrecord_gl_account.indexOf(row.account) != -1) return c;
      });
      if (res.length > 0) {
        row.commitmentItem = res[0];
      }
    }
    log.debug("commit and res", lines);
    //check for commitment and fund center for all lines exist or not
    var excludeList = ["12345"];
    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];
      if (row.type != "Discount" && excludeList.indexOf(row.item) == -1) {

        if (!row.fundCenter && !row.commitmentItem) {

          var msg = ""

          msg += "Fund Centre and Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>";
          msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
          msg += "2. Fund Centre Tagging." + "<br/>";
          msg += "3.Commitment Item and its Tagging." + "<br/>"
          msg += "4. Fund Centre to Commitment Item tagging. " + "<br/>";
          msg += "5. Initial Budget" + "<br/>";
          msg += " 6. Release Budget" + "<br/>";


          var techVal = ""
          techVal += "Item = " + row.item_txt + "<br/>"
          techVal += "Line = " + i + "<br/>"
          if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
            techVal += "Location = " + row.location_txt
          } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
            //  techVal += "Department = " + row.department_txt
          } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
            techVal += "Cost Center = " + row.cseg_cost_centre_txt
          }
          errors.push({
            title: "FUND CENTER AND COMMITMENT ITEM NOT FOUND",
            message: msg,
            tech_details: techVal
          });

        } else {
          if (!row.fundCenter) {


            var msg = ""

            msg += "Fund Centre is missing. Please create following records before proceeding further." + "<br/>";
            msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
            msg += "2. Fund Centre Tagging." + "<br/>";
            msg += "3. Fund Centre to Commitment Item tagging. " + "<br/>";
            msg += "4. Initial Budget" + "<br/>";
            msg += " 5. Release Budget" + "<br/>";


            var techVal = ""
            techVal += "Item = " + row.item_txt + "<br/>"
            techVal += "Line = " + i + "<br/>"
            techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techVal += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              //  techVal += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techVal += "Cost Center = " + row.cseg_cost_centre_txt
            }

            errors.push({
              title: "FUND CENTER NOT FOUND",
              message: msg,
              tech_details: techVal
            });

          }

          if (!row.commitmentItem) {
            var msg = ""
            msg += "Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>"
            msg += " 1. Commitment Item and its Tagging." + "<br/>"
            msg += " 2. Fund Centre to Commitment Item tagging." + "<br/>"
            msg += " 3. Initial Budget." + "<br/>"
            msg += " 4. Release Budget" + "<br/>"

            var techDetaii = ""
            techDetaii += "Item = " + row.item_txt + "<br/>"
            techDetaii += "Line = " + i + "<br/>"
            techDetaii += "Fund Center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techDetaii += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              //   techDetaii += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techDetaii += "Cost Center = " + row.cseg_cost_centre_txt
            }


            errors.push({
              title: "COMMITMENT ITEM NOT FOUND",
              message: msg,
              tech_details: techDetaii
            });

          }
        }



      }
    }

    if (errors.length == 0) {
      var commitment_items = pick(pick(lines, "commitmentItem"), "id");

      var fundcenter = pick(
        pick(lines, "fundCenter"),
        "custrecord_fund_center_list_name"
      );
      log.debug("fundcenter====>", fundcenter)

      var commitment_items_names = pick(pick(lines, "commitmentItem"), "name");
      log.debug("financial_year====>", financial_year)
      var fundcenter_names = pick(
        pick(lines, "fundCenter"),
        "custrecord_fund_center_list_name_txt"
      );
      log.debug("commitment_items====>", commitment_items)

      budgets = findBudget(fundcenter, commitment_items, financial_year);
      log.debug("budgets====>", budgets)
      for (var i = 0; i < lines.length; i++) {
        var row = lines[i];
        var res = budgets.filter(function (c) {
          if (
            c.custrecord_fund_center_name ==
            row.fundCenter.custrecord_fund_center_list_name &&
            c.custrecord_commitment_item_name == row.commitmentItem.id
          )
            return c;
        });

        if (res.length > 0) row.budget = res[0];
        else {
          var ff_msg = fundcenter_names.join(",")
          var cc_msg = commitment_items_names.join(",")

          var msg = ""

          msg += "Budget not found. Please create following records before proceeding further." + "<br/>"
          msg += "1. Fund Centre to Commitment Item Tagging (if not created before)" + "<br/>"
          msg += "1. Initial Budget." + "<br/>"
          msg += "2. Release Budget"


          var techDet = ""
          techDet += "Item = " + row.item_txt + "<br/>"
          techDet += " Fund center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "</br> "
          techDet += " Commitment Item = " + row.commitmentItem.name


          errors.push({
            title: "Budget not found",
            message: msg,
            tech_details: techDet
          });
        }
      }
    }
    return {
      errors: errors,
      budgets: budgets,
      lines: lines,
    };
  }

  function findBudgetUsingCostCenter(rec, lines) {
    var errors = [];
    var budgets = [];
    var subsidiary = getValue(rec, "subsidiary");
    var costcenter = getValue(rec, "cseg_cost_centre");
    var items = pick(lines, "cseg_cost_centre") || [];
    log.debug("linelevel cost center", items);
    var cc_list = items.filter(function (c) {
      if (c != "" && c != null && c != undefined) return c;
    });

    if (cc_list.length == 0 && !isNullorDefault(costcenter)) {
      cc_list = [costcenter];
    }

    if (cc_list.length == 0) {
      errors.push({
        title: "cost center not defined",
        message: "please select cost center for the line item",
        tech_details: ""
      });
    }
    var trandate = rec.getValue("trandate");
    var financial_year = getFinancialyear(trandate);
    if (!financial_year) {
      errors.push({
        title: "Financial year not found",
        message: "please select trandate or financial year not configured",
        tech_details: ""
      });
    }

    if (errors.length > 0) {
      return {
        errors: errors,
        budgets: [],
      };
    }

    var fundRes = findFundCenter(subsidiary, cc_list);

    log.debug("fundRes", fundRes);

    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];
      var res = fundRes.filter(function (c) {
        var cc = row.cseg_cost_centre;
        if (!cc) {
          row.cseg_cost_centre = costcenter;
          cc = costcenter;
        }

        var cc_center_budget = c.custrecord_cost_center_budget.split(",").map(function (x) {
          return parseInt(x);
        });

        log.debug("cc_center_budget", cc_center_budget)

        log.debug("cc_center_budget =>cc", cc)

        if (
          c.custrecord_item_budget == row.item &&
          cc_center_budget.indexOf(parseInt(cc)) != -1
        ) {
          return c;
        }
      });

      log.debug("fundRes->res", res);

      if (res.length == 0) {
        res = fundRes.filter(function (c) {
          var cc = row.cseg_cost_centre;
          if (!cc) {
            row.cseg_cost_centre = costcenter;
            cc = costcenter;
          }

          var cc_center_budget = c.custrecord_cost_center_budget.split(",").map(function (x) {
            return parseInt(x);
          });
          log.debug("fundRes->cc_center_budget", cc_center_budget);
          log.debug("fundRes->cc", cc);
          if (
            cc_center_budget.indexOf(parseInt(cc)) != -1 &&
            isNullorDefault(c.custrecord_item_budget)
          ) {
            return c;
          }
        });
      }

      log.debug("second->res", res);

      if (res.length > 0) {
        row.fundCenter = res[0];
      } else {
        var msg = ""

        msg += "Fund Centre is missing. Please create following records before proceeding further." + "<br/>";
        msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
        msg += "2. Fund Centre Tagging." + "<br/>";
        msg += "3. Fund Centre to Commitment Item tagging. " + "<br/>";
        msg += "4. Initial Budget" + "<br/>";
        msg += " 5. Release Budget" + "<br/>";


        var techVal = ""
        techVal += "Item = " + row.item_txt + "<br/>"
        techVal += "Line = " + i + "<br/>"
        //techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
        if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
          techVal += "Location = " + row.location_txt
        } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
          //   techVal += "Department = " + row.department_txt
        } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
          techVal += "Cost Center = " + row.cseg_cost_centre_txt
        }

        errors.push({
          title: "FUND CENTER NOT FOUND",
          message: msg,
          tech_details: techVal
        });
      }
    }

    if (errors.length > 0) {
      return {
        errors: errors,
        budgets: budgets,
      };
    }

    var accountList = pick(lines, "account");
    log.debug("accountList", accountList);
    var cmRes = findCommitmentItems(accountList);
    log.debug("cmRes", cmRes);

    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];
      var res = cmRes.filter(function (c) {
        if (c.custrecord_gl_account.indexOf(row.account) != -1) return c;
      });
      if (res.length > 0) {
        row.commitmentItem = res[0];
      } else {
        var msg = ""
        msg += "Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>"
        msg += " 1. Commitment Item and its Tagging." + "<br/>"
        msg += " 2. Fund Centre to Commitment Item tagging." + "<br/>"
        msg += " 3. Initial Budget." + "<br/>"
        msg += " 4. Release Budget" + "<br/>"

        var techDetaii = ""
        techDetaii += "Item = " + row.account_txt + "<br/>"
        techDetaii += "Line = " + i + "<br/>"
        techDetaii += "Fund Center = " + row.fundCenter?.custrecord_fund_center_list_name_txt + "<br/>"
        if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
          techDetaii += "Location = " + row.location_txt
        } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
          //   techDetaii += "Department = " + row.department_txt
        } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
          techDetaii += "Cost Center = " + row.cseg_cost_centre_txt
        }


        errors.push({
          title: "COMMITMENT ITEM NOT FOUND",
          message: msg,
          tech_details: techDetaii
        });
      }
    }

    if (errors.length == 0) {
      log.debug("commit and res", lines);
      //check for commitment and fund center for all lines exist or not
      var excludeList = ["12345"];
      for (var i = 0; i < lines.length; i++) {
        var row = lines[i];
        if (row.type != "Discount" && excludeList.indexOf(row) == -1) {


          if (!row.fundCenter && !row.commitmentItem) {

            var msg = ""

            msg += "Fund Centre and Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>";
            msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
            msg += "2. Fund Centre Tagging." + "<br/>";
            msg += "3.Commitment Item and its Tagging." + "<br/>"
            msg += "4. Fund Centre to Commitment Item tagging. " + "<br/>";
            msg += "5. Initial Budget" + "<br/>";
            msg += " 6. Release Budget" + "<br/>";


            var techVal = ""
            techVal += "Account = " + row.account_txt + "<br/>"
            techVal += "Line = " + i + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techVal += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              //   techVal += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techVal += "Cost Center = " + row.cseg_cost_centre_txt
            }
            errors.push({
              title: "FUND CENTER AND COMMITMENT ITEM NOT FOUND",
              message: msg,
              tech_details: techVal
            });

          } else {
            if (!row.fundCenter) {


              var msg = ""

              msg += "Fund Centre is missing. Please create following records before proceeding further." + "<br/>";
              msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
              msg += "2. Fund Centre Tagging." + "<br/>";
              msg += "3. Fund Centre to Commitment Item tagging. " + "<br/>";
              msg += "4. Initial Budget" + "<br/>";
              msg += " 5. Release Budget" + "<br/>";


              var techVal = ""
              techVal += "Account = " + row.account_txt + "<br/>"
              techVal += "Line = " + i + "<br/>"
              techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
              if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
                techVal += "Location = " + row.location_txt
              } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
                //  techVal += "Department = " + row.department_txt
              } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
                techVal += "Cost Center = " + row.cseg_cost_centre_txt
              }

              errors.push({
                title: "FUND CENTER NOT FOUND",
                message: msg,
                tech_details: techVal
              });

            }

            if (!row.commitmentItem) {
              var msg = ""
              msg += "Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>"
              msg += " 1. Commitment Item and its Tagging." + "<br/>"
              msg += " 2. Fund Centre to Commitment Item tagging." + "<br/>"
              msg += " 3. Initial Budget." + "<br/>"
              msg += " 4. Release Budget" + "<br/>"

              var techDetaii = ""
              techDetaii += "Account = " + row.account_txt + "<br/>"
              techDetaii += "Line = " + i + "<br/>"
              techDetaii += "Fund Center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "<br/>"
              if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
                techDetaii += "Location = " + row.location_txt
              } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
                //   techDetaii += "Department = " + row.department_txt
              } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
                techDetaii += "Cost Center = " + row.cseg_cost_centre_txt
              }


              errors.push({
                title: "COMMITMENT ITEM NOT FOUND",
                message: msg,
                tech_details: techDetaii
              });

            }
          }
        }
      }

      if (errors.length == 0) {
        var commitment_items = pick(pick(lines, "commitmentItem"), "id");
        var fundcenter = pick(
          pick(lines, "fundCenter"),
          "custrecord_fund_center_list_name"
        );

        // log.debug("fundcenter",fundcenter)
        // log.debug("commitment_items",commitment_items)
        // log.debug("financial_year",financial_year)

        var commitment_items_names = pick(pick(lines, "commitmentItem"), "name");
        var fundcenter_names = pick(
          pick(lines, "fundCenter"),
          "custrecord_fund_center_list_name_txt"
        );

        budgets = findBudget(fundcenter, commitment_items, financial_year);
        for (var i = 0; i < lines.length; i++) {
          var row = lines[i];
          var res = budgets.filter(function (c) {
            if (
              c.custrecord_fund_center_name ==
              row.fundCenter.custrecord_fund_center_list_name &&
              c.custrecord_commitment_item_name == row.commitmentItem.id
            )
              return c;
          });

          if (res.length > 0) row.budget = res[0];
          else {
            var ff_msg = fundcenter_names.join(",")
            var cc_msg = commitment_items_names.join(",")

            var msg = ""

            msg += "Budget not found. Please create following records before proceeding further." + "<br/>"
            msg += "1. Fund Centre to Commitment Item Tagging (if not created before)" + "<br/>"
            msg += "1. Initial Budget." + "<br/>"
            msg += "2. Release Budget"


            var techDeta = ""
            techDeta += "Item = " + row.item_txt + "<br/>"
            techDeta += " Fund center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "</br> "
            techDeta += " Commitment Item = " + row.commitmentItem.name


            errors.push({
              title: "Budget not found",
              message: msg,
              tech_details: techDeta
            });
          }
        }
      }
    }

    return {
      errors: errors,
      budgets: budgets,
    };

  }

  function findBudgetUsingProjectTask(rec, lines) {


    var errors = [];
    var budgets = [];
    var subsidiary = getValue(rec, "subsidiary");
    //var costcenter = getValue(rec, "cseg_cost_centre");
    var items = pick(lines, "item") || [];

    var projectTask = pick(lines, "projecttask");

    log.debug("linelevel items", items);

    var trandate = rec.getValue("trandate");

    var financial_year = getFinancialyear(trandate);

    if (!financial_year) {
      errors.push({
        title: "Financial year not found",
        message: "please select trandate or financial year not configured",
        tech_details: ""
      });
    }
    if (errors.length > 0) {
      return {
        errors: errors,
        budgets: [],
      };
    }

    var req = {
      type: "customrecord_fund_center_budget",
      filters: [
        ["isinactive", "is", false],
        "AND",
        ["custrecord_subsidiary_budget", "anyof", subsidiary],
        "AND",
        ["custrecord_project_task", "anyof", projectTask]
      ],
      columns: [
        "custrecord_subsidiary_budget",
        "custrecord_item_budget",
        "custrecord_fund_center_list_name",
        "custrecord_location_budget",
        "custrecord_cost_center_budget",
        "custrecord_deparment_tagging",
        "custrecord_project_task"
      ],
    };
    var fundRes = getSearch(req.type, req.filters, req.columns);

    log.debug("findBudgetUsingItem->fundRes", fundRes)

    for (var i = 0; i < lines.length; i++) {

      var row = lines[i];

      var res = fundRes.filter(function (c) {
        if (c.custrecord_project_task == row.projecttask && c.custrecord_item_budget == row.item)
          return c;
      });

      if (res.length > 0) {
        row.fundCenter = res[0];
      }

      if (!row.fundCenter) {

        var res = fundRes.filter(function (c) {
          if (c.custrecord_project_task == row.projecttask)
            return c;
        });

        if (res.length > 0) {
          row.fundCenter = res[0];
        }
      }



    }






    var accountList = pick(lines, "account");
    var cmRes = findCommitmentItems(accountList);

    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];
      var res = cmRes.filter(function (c) {
        if (c.custrecord_gl_account.indexOf(row.account) != -1) return c;
      });
      if (res.length > 0) {
        row.commitmentItem = res[0];
      }
    }
    log.debug("new updated lines", lines);
    //check for commitment and fund center for all lines exist or not
    var excludeList = ["12345"];
    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];
      log.debug("FUNDCENTER/COMMITMENT->row", row);
      if (row.type != "Discount" && excludeList.indexOf(row.item) == -1) {
        if (!row.fundCenter && !row.commitmentItem) {
          var msg = ""
          msg += "Fund Centre and Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>";
          msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
          msg += "2. Fund Centre Tagging." + "<br/>";
          msg += "3.Commitment Item and its Tagging." + "<br/>"
          msg += "4. Fund Centre to Commitment Item tagging. " + "<br/>";
          msg += "5. Initial Budget" + "<br/>";
          msg += " 6. Release Budget" + "<br/>";

          var techVal = ""
          techVal += "Item = " + row.item_txt + "<br/>"
          techVal += "Line = " + i + "<br/>"
          if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
            techVal += "Location = " + row.location_txt
          } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
            // techVal += "Department = " + row.department_txt
          } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
            techVal += "Cost Center = " + row.cseg_cost_centre_txt
          }
          errors.push({
            title: "FUND CENTER AND COMMITMENT ITEM NOT FOUND",
            message: msg,
            tech_details: techVal
          });

        } else {
          if (!row.fundCenter) {
            var msg = ""

            msg += "Fund Centre is missing. Please create following records before proceeding further." + "<br/>";
            msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
            msg += "2. Fund Centre Tagging." + "<br/>";
            msg += "3. Fund Centre to Commitment Item tagging. " + "<br/>";
            msg += "4. Initial Budget" + "<br/>";
            msg += " 5. Release Budget" + "<br/>";


            var techVal = ""
            techVal += "Item = " + row.item_txt + "<br/>"
            techVal += "Line = " + i + "<br/>"
            techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techVal += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              // techVal += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techVal += "Cost Center = " + row.cseg_cost_centre_txt
            }

            errors.push({
              title: "FUND CENTER NOT FOUND",
              message: msg,
              tech_details: techVal
            });

          }

          if (!row.commitmentItem) {
            var msg = ""
            msg += "Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>"
            msg += " 1. Commitment Item and its Tagging." + "<br/>"
            msg += " 2. Fund Centre to Commitment Item tagging." + "<br/>"
            msg += " 3. Initial Budget." + "<br/>"
            msg += " 4. Release Budget" + "<br/>"

            var techDetaii = ""
            techDetaii += "Item = " + row.item_txt + "<br/>"
            techDetaii += "Line = " + i + "<br/>"
            techDetaii += "Fund Center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techDetaii += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              //   techDetaii += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techDetaii += "Cost Center = " + row.cseg_cost_centre_txt
            }


            errors.push({
              title: "COMMITMENT ITEM NOT FOUND",
              message: msg,
              tech_details: techDetaii
            });

          }
        }
      }
    }

    if (errors.length == 0) {
      var commitment_items = pick(pick(lines, "commitmentItem"), "id");
      // var commitment_items_names = pick(pick(lines, "commitmentItem"), "name");
      var fundcenter = pick(
        pick(lines, "fundCenter"),
        "custrecord_fund_center_list_name"
      );

      // var fundcenter_names = pick(
      //   pick(lines, "fundCenter"),
      //   "custrecord_fund_center_list_name_txt"
      // );
      budgets = findBudget(fundcenter, commitment_items, financial_year);

      log.debug("updated budgets", budgets);

      for (var i = 0; i < lines.length; i++) {
        var row = lines[i];

        log.debug("find budget for row", row);

        var res = budgets.filter(function (c) {
          if (
            c.custrecord_fund_center_name ==
            row.fundCenter.custrecord_fund_center_list_name &&
            c.custrecord_commitment_item_name == row.commitmentItem.id
          )
            return c;
        });

        log.debug("find for res", res);

        if (res.length > 0) {
          row.budget = res[0];
        }
        else {
          var ff_msg = row.fundCenter.custrecord_fund_center_list_name_txt
          var cc_msg = row.commitmentItem.name

          var msg = ""
          msg += "Budget not found. Please create following records before proceeding further." + "<br/>"
          msg += "1.Fund Centre to Commitment Item Tagging (if not created before)" + "<br/>"
          msg += " 2. Initial Budget." + "<br/>"
          msg += " 3. Release Budget" + "<br/>"


          var techDetails = ""
          techDetails += "\n Item = " + row.item_txt + "<br/>"
          techDetails += "\nFund Center = " + ff_msg + "</br> "
          techDetails += "\nCommitment Item = " + cc_msg


          errors.push({
            title: "Budget not Found",
            message: msg,
            tech_details: techDetails
          });
        }
      }
    }



    return {
      errors: errors,
      budgets: budgets,
    };
  }

  function printErrors(errorList) {
    for (var i = 0; i < errorList.length; i++) {
      var row = errorList[i];

      showError(row.title, row.message);
    }
  }

  function printWarnings(warningList) {
    for (var i = 0; i < warningList.length; i++) {
      var row = warningList[i];

      showWarning(row.title, row.message);
    }
  }

  function showWarning(title, details) {
    log.debug(title, details);
  }

  /**
   * Description:Updates the line item of the transaction with relavant data for the line.
   * @param {Array} items
   * @param {Record} curRec
   * @returns {void}
   */

  function updatelineItems(items, curRec) {
    var item_ids = pick(items, "item");
    if (item_ids.length > 0) {
      var details = getItemDetails(item_ids);
      for (var i = 0; i < items.length; i++) {
        var row = items[i];

        if (isNullorDefault(row.department)) {
          row.department = curRec.getValue("department");
        }

        if (isNullorDefault(row.location)) {
          row.location = curRec.getValue("location");
          row.location_txt = curRec.getText("location");
        }

        if (isNullorDefault(row.cseg_cost_centre)) {
          row.cseg_cost_centre = curRec.getValue("cseg_cost_centre");
        }

        var res = details.filter(function (c) {
          if (c.id == row.item) return c;
        });

        if (res.length > 0) {
          Object.assign(row, res[0]);
          if (row.type == "InvtPart" || row.type == "Assembly") {
            row.account = row.assetaccount;
            row.account_txt = row.assetaccount_txt;
          } else {
            row.account = row.expenseaccount;
            row.account_txt = row.expenseaccount_txt;
          }

          if ((row.custitemother_charges_service > 0 && row.type == "Service") || (row.item == 198496)) {
            row.ignoreBudget = true;
          } else {
            row.ignoreBudget = false;
          }
        }
      }
    }
  }

  function updateExpenseLines(expenseItems, curRec) {
    for (var i = 0; i < expenseItems.length; i++) {
      var row = expenseItems[i];
      if (isNullorDefault(row.cseg_cost_centre)) {
        row.cseg_cost_centre = curRec.getValue("cseg_cost_centre");
      }
    }
  }

  function updateResponseToRecord(response, expResponse, curRec) {
    var messages = [];
    messages = messages.concat(expResponse.errors, expResponse.warning);
    messages = messages.concat(response.errors, response.warning);
    messages = removeNullOrDefault(messages);
    var error_msg = ''
    if (messages.length > 0) {
      messages = messages.map(function (c) {
        return {
          Error_Code: c.title,
          Message: c.message,
          Technical_Details: c.tech_details
        }
      })
      error_msg = tableGen.toTable(messages);
    }
    else
      error_msg = ''
    // for (var key in messages) {
    //   var row = messages[key];
    //   if (row) {
    //     error_msg += row.title + "\n";
    //     error_msg += row.message + "\n";
    //     error_msg +=
    //       "----------------------------------------------------------------------\n";
    //   }
    // }

    // error_msg = error_msg.replace(/<\/br>/g, "  ");

    if (error_msg.length > 0) {
      curRec.setValue("custbody_budget_error", error_msg);


      var count = curRec.getLineCount("item");

      for (var i = 0; i < count; i++) {

        curRec.selectLine({
          sublistId: "item",
          line: i
        });

        curRec.setCurrentSublistValue({
          sublistId: "item",
          fieldId: "custcol_amount_not_utilised",
          value: null,
        });

        curRec.setCurrentSublistValue({
          sublistId: "item",
          fieldId: "custcol_utilized_amount_001",
          value: null
        });

        curRec.commitLine({
          sublistId: "item"
        })

      }

      var count = curRec.getLineCount("expense");

      for (var i = 0; i < count; i++) {

        curRec.selectLine({
          sublistId: "expense",
          line: i
        });

        curRec.setCurrentSublistValue({
          sublistId: "expense",
          fieldId: "custcol_amount_not_utilised",
          value: null
        });

        curRec.setCurrentSublistValue({
          sublistId: "expense",
          fieldId: "custcol_utilized_amount_001",
          value: null
        });

        curRec.commitLine({
          sublistId: "expense"
        })

      }

    } else {
      curRec.setValue("custbody_budget_error", "");
    }
  }

  function getItemDetails(item_ids) {
    var itemSer = {
      type: "item",
      filters: [["internalid", "anyof", item_ids]],
      columns: [
        "expenseaccount",
        "custitem_sub_group_1",
        "assetaccount",
        "type",
        "custitemother_charges_service",
        "custitem_item_category"
      ],
    };

    return getSearch(itemSer.type, itemSer.filters, itemSer.columns);
  }

  function getLineItems(curRec) {
    var col = [];
    if (curRec.type == "purchaseorder" || curRec.type == "vendorbill") {
      col = [
        "item",
        "rate",
        "amount",
        "quantity",
        "department",
        "location",
        "custcol_budget_item_type",
        "cseg_cost_centre",
        "isclosed",
        "custcol_line_unique_key",
        "custcol_in_hsn_code",
        "custcol_in_nature_of_item",
        "linkedorder",
        "quantityreceived",
        "custcol_prev_consumed_amt",
        "custcol_po_reference",
        "custcolpo_link",
        "custcol_req_link",
        "custcol_gst_nature",
        "taxamount",
        "netamount",
        "custcol_tds",
        "projecttask",

      ];
    } else {
      col = [
        "item",
        "rate",
        "estimatedamount",
        "quantity",
        "department",
        "location",
        "custcol_budget_item_type",
        "cseg_cost_centre",
        "isclosed",
        "custcol_line_unique_key",
        "custcol_in_hsn_code",
        "custcol_in_nature_of_item",
        "custcol_prev_consumed_amt",
        "custcolpo_link",
        "custcol_req_link",
        "netamount",
        "projecttask"
      ];
    }

    var list = getLines(curRec, "item", col);

    log.debug("item list list", list);

    if (curRec.type == "purchaseorder") {
      var req_ids = removeNullOrDefault([].concat.apply([], pick(list, "linkedorder")));
      log.debug("requistion ids", req_ids);
      if (req_ids.length > 0) {
        var req_lines = getTranLines("purchaserequisition", req_ids);
        log.debug("all requistion lines", req_lines);
        for (var i = 0; i < list.length; i++) {
          var poline = list[i];

          var prline = req_lines.filter(function (c) {
            if (c.custcol_req_link == poline.custcol_req_link && poline.item == c.item) {
              return c;
            }
          });

          log.debug("all requistion lines", req_lines);
          if (prline.length > 0) {
            poline.prline = prline[0];
          }
        }
      }
      //do nothing
    }
    else if (curRec.type == "vendorbill") {



      if (PO_DATA.length == 0) {
        var po_ids = removeNullOrDefault([].concat.apply([], pick(list, "custcolpo_link")));
        log.debug("po_ids", po_ids)
        log.debug("po_ids.length", po_ids.length)


        if (po_ids.length > 0) {
          po_ids = po_ids.map(x => x.split("_")[0]);
          log.debug('po_ids', po_ids);
          PO_DATA = getTranLines("purchaseorder", po_ids);
          log.debug('PO_DATA', PO_DATA);
        }
      }

      for (var i = 0; i < list.length; i++) {

        var vbline = list[i];

        log.debug('vbline', vbline);

        var line_res = PO_DATA.filter(function (c) {
          log.debug("vbline->c", c);
          if (c.item == vbline.item && c.custcolpo_link == vbline.custcolpo_link)
            return c;
        });

        if (line_res.length > 0) {
          vbline.poline = line_res[0];
        }
      }
    }
    else {
      log.debug("curRec.type", curRec.type)
      list.forEach(function (c) {
        c.amount = c.estimatedamount;
      });
    }
    log.debug("initial lines", list);
    return list;
  }

  function getTranLines(type, req_ids) {
    var ser = {
      type: type,
      filters: [
        ["mainline", "is", false],
        "AND",
        ["internalid", "anyof", req_ids]
      ],
      columns: [
        "item",
        "quantity",
        "quantityuom",
        "rate",
        "amount",
        "estimatedamount",
        "closed",
        "custbody_validation_budget_pending",
        "custcol_prev_consumed_amt",
        "trandate",
        "custcol_req_link",
        "custcolpo_link",
        "netamount"
      ]
    };

    return getSearch(ser.type, ser.filters, ser.columns);
  }


  function getPRExpenseLines(type, req_ids) {
    var ser = {
      type: type,
      filters: [
        ["mainline", "is", false],
        "AND",
        ["internalid", "anyof", req_ids]
      ],
      columns: [
        "account",
        "rate",
        "amount",
        "estimatedamount",
        "closed",
        "custbody_validation_budget_pending",
        "custcol_prev_consumed_amt",
        "trandate",
        "custcol_req_link",
        "custcolpo_link",
        "netamount"
      ]
    };

    return getSearch(ser.type, ser.filters, ser.columns);
  }

  function getExpenseList(curRec) {
    var col = [];
    if (curRec.type == "purchaseorder" || curRec.type == "vendorbill") {
      col = [
        "account",
        "rate",
        "amount",
        "department",
        "location",
        "cseg_cost_centre",
        "isclosed",
        "custcol_line_unique_key",
        "custcolpo_link",
        "custcol_prev_consumed_amt",
        "linkedorder",
        "custcol_req_link"
      ];
    } else {
      col = [
        "account",
        "rate",
        "estimatedamount",
        "department",
        "location",
        "cseg_cost_centre",
        "isclosed",
        "custcol_line_unique_key",
        "custcolpo_link",
        "custcol_prev_consumed_amt"
      ];
    }

    var list = getLines(curRec, "expense", col);

    if (curRec.type == "purchaseorder" || curRec.type == "vendorbill") {
      //do nothing
    } else {

      list.forEach(function (c) {
        c.amount = c.estimatedamount;
      });
    }

    if (curRec.type == "purchaseorder") {

      var req_ids = removeNullOrDefault([].concat.apply([], pick(list, "linkedorder")));
      log.debug("requistion ids", req_ids);
      if (req_ids.length > 0) {
        var req_lines = getPRExpenseLines("purchaserequisition", req_ids);
        log.debug("all requistion lines", req_lines);
        for (var i = 0; i < list.length; i++) {
          var poExline = list[i];

          var prline = req_lines.filter(function (c) {
            if (c.custcol_req_link == poExline.custcol_req_link && poExline.account == c.account) {
              return c;
            }
          });

          log.debug("all requistion lines", req_lines);
          if (prline.length > 0) {
            poExline.prline = prline[0];
          }
        }

      }
    }

    if (curRec.type == "vendorbill") {

      var po_ids = removeNullOrDefault([].concat.apply([], pick(list, "custcolpo_link")));

      log.debug("expense->po_ids", po_ids)

      if (po_ids.length > 0) {

        po_ids = po_ids.map(x => x.split("_")[0]);

        log.debug('po_ids', po_ids);

        var poExpenseLines = getPOExpenseLines(po_ids);

        log.debug('poExpenseLines', poExpenseLines);


        for (var i = 0; i < list.length; i++) {

          var vbExpenseRow = list[i];

          var poRowRes = poExpenseLines.find(function (c) {
            if (c.account == vbExpenseRow.account && c.custcolpo_link == vbExpenseRow.custcolpo_link)
              return c;
          });

          if (poRowRes)
            vbExpenseRow.poline = poRowRes;
        }
      }
    }


    return list;
  }




  function getPOExpenseLines(polist) {

    var ser = {
      type: "purchaseorder",
      filters: [
        ["type", "anyof", "PurchOrd"],
        "AND",
        ["internalidnumber", "equalto", polist],
        "AND",
        ["mainline", "is", "F"],
        "AND",
        ["taxline", "is", "F"],
        "AND",
        ["item", "anyof", "@NONE@"]
      ],
      columns: [
        "account",
        "amount",
        "estimatedamount",
        "department",
        "location",
        "cseg_cost_centre",
        "custcol_line_unique_key",
        "custcol_prev_consumed_amt",
        "custcolpo_link"
      ]
    };

    return getSearch(ser.type, ser.filters, ser.columns);

  }

  function setEnv(ctx) {
    SEARCH = search;
    RECORD = record;
    RUNTIME = runtime;
    MOMENT = moment;
    BACK_TRACK = [];
  }

  function getOldRec(tranrec) {
    try {
      var oldRecJSON = tranrec.getValue("custbody_old_record_date");

      log.debug("oldRecJSON", oldRecJSON);

      return JSON.parse(oldRecJSON);
    } catch (e) {
      log.error("get old rec", e);

      return {
        MODE: 'create',
        ITEM_LIST: [],
        EXPENSE_LIST: [],
        CURRENCY: tranrec.getValue("currency"),
        CNVRT_FROM_PO: false,
        EXCHANGE_RATE: toNumRaw(tranrec.getValue("exchangerate")),
        PO_DATA: [],
        OLD_DATE: new Date(),
        OLD_CURRENCY: tranrec.getValue("currency")
      };
    }
  }

  function updateGlobals(tranrec) {
    var oldRec = getOldRec(tranrec);
    log.debug("oldRec", oldRec);
    MODE = oldRec.MODE;
    ITEM_LIST = oldRec.ITEM_LIST;
    EXPENSE_LIST = oldRec.EXPENSE_LIST;
    OLD_DATE = new Date(oldRec.OLD_DATE);
    ITEM_LINES_REM_FLG = oldRec.ITEM_LINES_REM_FLG;
    EXP_LINES_REM_FLG = oldRec.EXP_LINES_REM_FLG;
    CURRENCY = oldRec.CURRENCY;
    OLD_CURRENCY = oldRec.CURRENCY;
    OLD_EXCHANGE_RATE = oldRec.EXCHANGE_RATE;
    PO_DATA = oldRec.PO_DATA || [];
    CNVRT_FROM_PO = oldRec.CNVRT_FROM_PO;
    EXCHANGE_RATE = toNumRaw(tranrec.getValue("exchangerate"));
    CURRENCY = tranrec.getValue("currency");
    OLD_FIN_YEAR = oldRec.OLD_FIN_YEAR;
    FIRST_EDIT = oldRec.FIRST_EDIT

    var locationSer = {
      type: "location",
      filters: [["isinactive", "is", false]],
      columns: ["name", "custrecord_parent_budget"],
    };

    LOCATION_LIST = getSearch(
      locationSer.type,
      locationSer.filters,
      locationSer.columns
    );

    log.debug("location loaded", LOCATION_LIST);

    for (var i = 0; i < LOCATION_LIST.length; i++) {
      LOCATION_LIST[i].parent = getParentId(LOCATION_LIST[i], LOCATION_LIST);
    }

    var fundCenterSer = {
      type: "customrecord_fund_center_list",
      columns: ["name"],
      filters: [],
    };

    FUND_CENTER_LIST = getSearch(
      fundCenterSer.type,
      fundCenterSer.filter,
      fundCenterSer.columns
    );

    if (tranrec.type == "purchaserequisition") {
      var poLinesSer = {
        type: "purchaseorder",
        filters: [
          ["type", "anyof", "PurchOrd"],
          "AND",
          ["appliedtotransaction", "anyof", tranrec.id],
        ],
        columns: [
          search.createColumn({ name: "item", label: "Item" }),

          search.createColumn({
            name: "custbody_fam_specdeprjrn_rate", label: "Rate",
          }),

          search.createColumn({ name: "quantityuom", label: "Quantity" }),

          search.createColumn({ name: "custcol_req_link" })
        ],
      };
      REQ_PO_LINES = getSearch(
        poLinesSer.type,
        poLinesSer.filters,
        poLinesSer.columns
      );
      log.debug("exising po for req", REQ_PO_LINES);
    }

  }

  function updateOldBudgets() {
    if (MODE == "edit") {
      var old_financial_year = OLD_FIN_YEAR //getFinancialyear(OLD_DATE);
      //release the old budgets
      var item_fund_centers = pick(ITEM_LIST, "custcol_fund_center_pr");
      var item_commitment_items = pick(ITEM_LIST, "custcol_commitment_item_pr");

      var exp_fund_centers = pick(EXPENSE_LIST, "custcol_fund_center_pr");
      var exp_commitment_items = pick(
        EXPENSE_LIST,
        "custcol_commitment_item_pr"
      );

      //add all to together
      var fund_centers = removeNullOrDefault(
        item_fund_centers.concat(exp_fund_centers)
      );
      var commit_items = removeNullOrDefault(
        item_commitment_items.concat(exp_commitment_items)
      );
      //log.debug(fund_centers);
      //log.debug(commit_items);

      log.debug("old fundcenters:", fund_centers);
      log.debug("old commit_items:", commit_items);

      var old_budgets = findBudget(
        fund_centers,
        commit_items,
        old_financial_year
      );

      for (var i = 0; i < EXPENSE_LIST.length; i++) {
        var exp = EXPENSE_LIST[i];
        var budgetRes = old_budgets.filter(function (c) {
          if (
            c.custrecord_fund_center_name == exp.custcol_fund_center_pr &&
            c.custrecord_commitment_item_name == exp.custcol_commitment_item_pr
          )
            return c;
        });
        if (budgetRes.length > 0) {
          exp.budget = budgetRes[0];
        }
      }

      for (var i = 0; i < ITEM_LIST.length; i++) {
        var row = ITEM_LIST[i];
        var budgetRes = old_budgets.filter(function (c) {
          var fund_id = row.custcol_fund_center_pr;
          if (
            c.custrecord_fund_center_name == fund_id &&
            c.custrecord_commitment_item_name == row.custcol_commitment_item_pr
          )
            return c;
        });
        if (budgetRes.length > 0) {
          row.budget = budgetRes[0];
        }
      }
    }
  }

  function handleFinancialYearChange(rec, lineitems, expenselines) {
    var currentDate = rec.getValue("trandate");
    var old_financial_year = OLD_FIN_YEAR //getFinancialyear(OLD_DATE);
    var new_financial_year = getFinancialyear(currentDate);

    log.debug("old financial year", old_financial_year);
    log.debug("new financial year", new_financial_year);


    switch (rec.type) {
      case "purchaserequisition":
        handlePRYearChange(old_financial_year, new_financial_year);
        break;
      case "purchaseorder":
        handlePOFYChange(rec, lineitems, expenselines, old_financial_year, new_financial_year);
        break;
      case "vendorbill":
        handleBillFYChange(rec, lineitems, expenselines);
        break;
    }

  }

  function handlePRYearChange(oldFinPO, newFinPO) {

    if (oldFinPO != newFinPO) {
      var item_release_list = ITEM_LIST.filter(function (c) {
        if (c.budget) return c;
      }).map(function (c) {
        var amount = c.estimatedamount;

        return {
          budget: c.budget.id,
          oldLine: {
            amount: amount,
          },
        };
      });
      RELEASE_LIST = RELEASE_LIST.concat(item_release_list);
      var exp_release_list = EXPENSE_LIST.filter(function (c) {
        if (c.budget) return c;
      }).map(function (c) {
        var amount = c.estimatedamount;
        return {
          budget: c.budget.id,
          oldLine: {
            amount: amount,
          },
        };
      });
      RELEASE_LIST = RELEASE_LIST.concat(exp_release_list);
    }
  }

  function handlePOFYChange(rec, lines, explines, oldFinPO, newFinPO) {

    //check whether
    var req_link = pick(ITEM_LIST, "custcol_req_link");

    var exp_req_link = pick(EXPENSE_LIST, "custcol_req_link");

    var createdfrom_ids = unique(req_link.concat(exp_req_link));

    log.debug("createdfrom_ids at line", createdfrom_ids);

    createdfrom_ids = createdfrom_ids.map(x => x.split("_")[0])


    var pr_fin_year_data = []
    if (createdfrom_ids.length > 0) {
      pr_fin_year_data = getFinancialYearForIDS(createdfrom_ids)
    }


    log.debug("pr_fin_year_data", pr_fin_year_data);

    var res = createdfrom_ids.filter(function (c) {
      if (c.id == rec.id) {
        return c;
      }
    });

    log.debug("res", res.length)

    if (res.length == 0) {
      //converted from req
      log.debug("converted from req", true);

      for (var i = 0; i < lines.length; i++) {

        var row = lines[i];

        var oldLine = ITEM_LIST.find(x => x.custcol_line_unique_key == row.custcol_line_unique_key);
        log.debug("oldLine", oldLine)

        var requistion = null
        if (oldLine) {

          requistion = oldLine.custcol_req_link.split("_")[0];
          log.debug("requistion", requistion)
        }

        var prFinYr = pr_fin_year_data.find(x => x.id == requistion)

        if (prFinYr) {
          prFinYr = prFinYr.financial_year;
          log.debug("prFinYr", prFinYr);
          log.debug("oldFinPO", oldFinPO);
          log.debug("newFinPO", newFinPO);

          if ((prFinYr == oldFinPO && oldFinPO < newFinPO) || (FIRST_EDIT && prFinYr != newFinPO)) {
            //2023 2023 2024  

            log.debug("prFinYr == oldFinPO && oldFinPO < newFinPO", true);
            var remaning_amount = toNum(getBudgetRemaining(row));
            var rem = remaning_amount - row.amount;
            addorUpdate({
              id: row.budget.id,
              rem: rem,
              utilised: oldLine.amount,
              org_utilised: 0//toNum(row.budget.custrecord_utilised_amount)
            });
          } else if (prFinYr < oldFinPO && oldFinPO < newFinPO) {

            log.debug("prFinYr < oldFinPO && oldFinPO < newFinPO", true);
            RELEASE_LIST.push({
              budget: oldLine.budget.id,
              oldLine: {
                amount: oldLine.amount
              }
            })
            //
            addorUpdate({
              id: row.budget.id,
              rem: rem,
              utilised: oldLine.amount,
              org_utilised: 0//toNum(row.budget.custrecord_utilised_amount)
            });

          } else if (prFinYr < oldFinPO && prFinYr == newFinPO) {
            log.debug("prFinYr < oldFinPO && prFinYr == newFinPO", true);
            //2024	2026	2024
            RELEASE_LIST.push({
              budget: oldLine.budget.id,
              oldLine: {
                amount: oldLine.amount
              }
            })
          } else if (prFinYr < oldFinPO && oldFinPO > newFinPO) {

            //2024	2026	2025
            log.debug("prFinYr < oldFinPO && oldFinPO > newFinPO", true);

            RELEASE_LIST.push({
              budget: oldLine.budget.id,
              oldLine: {
                amount: oldLine.amount
              }
            })
            //
            addorUpdate({
              id: row.budget.id,
              rem: rem,
              utilised: oldLine.amount,
              org_utilised: 0//toNum(row.budget.custrecord_utilised_amount)
            });


          }
        }
      }

    } else {
      if (oldFinPO != newFinPO) {
        //direct po
        var item_release_list = ITEM_LIST.filter(function (c) {
          if (c.budget) return c;
        }).map(function (c) {
          return {
            budget: c.budget.id,
            oldLine: {
              amount: c.amount,
            },
          };
        });

        RELEASE_LIST = RELEASE_LIST.concat(item_release_list);

        var exp_release_list = EXPENSE_LIST.filter(function (c) {
          if (c.budget) return c;
        }).map(function (c) {
          return {
            budget: c.budget.id,
            oldLine: {
              amount: c.amount,
            },
          };
        });

        RELEASE_LIST = RELEASE_LIST.concat(exp_release_list);
        //release direct po list
        log.debug("release direct po list", RELEASE_LIST);

      }
    }
  }


  function getFinancialYearForIDS(ids) {
    var ser = {
      type: "transaction",
      filters: [
        ["mainline", "is", true],
        "AND",
        ["internalid", "anyof", ids]
      ],
      columns: ["internalid", "trandate"]
    }

    var res = getSearch(ser.type, ser.filters, ser.columns);
    log.debug("res", res)
    return res.map(function (c) {

      return {
        id: c.internalid,
        financial_year: getFinancialyear(new moment(c.trandate, "D/M/YYYY").toDate())
      }
    })


  }

  function handleBillFYChange(rec, lineitems, expenselines, oldFinPO, newFinPO) {
    var billExchangeRate = toNumRaw(rec.getValue("exchangerate"))
    log.debug("billExcRate", billExchangeRate)


    log.debug("CNVRT_FROM_PO", CNVRT_FROM_PO)

    if (CNVRT_FROM_PO == false) {

      if (oldFinPO != newFinPO) {
        var item_release_list = ITEM_LIST.filter(function (c) {
          if (c.budget) return c;
        }).map(function (c) {
          return {
            budget: c.budget.id,
            oldLine: {
              amount: c.amount * billExchangeRate,
            }
          };
        });

        RELEASE_LIST = RELEASE_LIST.concat(item_release_list);

        var exp_release_list = EXPENSE_LIST.filter(function (c) {
          if (c.budget) return c;
        }).map(function (c) {
          return {
            budget: c.budget.id,
            oldLine: {
              amount: c.amount * billExchangeRate,
            }
          };
        });

        RELEASE_LIST = RELEASE_LIST.concat(exp_release_list);

        log.debug("financial year release list", RELEASE_LIST);
      }



    }
    else {

      log.debug("CNVRT_FROM_PO", CNVRT_FROM_PO)
      //bill
      var currentDate = rec.getValue("trandate");

      var po_financial_year = getFinancialyear(new moment(PO_DATA[0].trandate, "D/M/YYYY").toDate())

      var old_bill_financial_year = OLD_FIN_YEAR //getFinancialyear(OLD_DATE);

      var new_bill_financial_year = getFinancialyear(currentDate);

      var billExchangeRateVal = toNumRaw(rec.getValue("exchangerate"))
      log.debug("billExcRateval", billExchangeRateVal)


      log.debug("old_bill_financial_year", old_bill_financial_year)

      log.debug("new_bill_financial_year", new_bill_financial_year)

      log.debug("po_financial_year", po_financial_year)

      // +-------+-------------+-------------+---------------------------------------------------------------------------------------+
      // | PO FY | Old Bill FY | New Bill FY | To Do                                                                                 |
      // +-------+-------------+-------------+---------------------------------------------------------------------------------------+
      // | 2024  |             | 2024        | Budget should change only if change in bill amount           ->ditch                          |
      // | 2024  | 2024        | 2025        | Budget of New Bill FY should get consumed                                             |
      // | 2024  | 2025        | 2026        | Budget of Old Bill FY should get reversed. Budget in New Bill FY should get consumed  |
      // | 2024  | 2026        | 2024        | Budget of Old Bill FY should get reversed.                                            |
      // +-------+-------------+-------------+---------------------------------------------------------------------------------------+

      //handles both increase or decrease
      if (new_bill_financial_year != old_bill_financial_year && old_bill_financial_year == po_financial_year) {

        log.debug("if condition", "new_bill_financial_year != old_bill_financial_year && old_bill_financial_year == po_financial_year", true)
        //old bill financial year budget is released

        //new bill financial year is consumed

        for (var i = 0; i < lineitems.length; i++) {
          var row = lineitems[i];

          if (row.budget) {

            var remaning_amount = toNum(getBudgetRemaining(row));

            log.debug("row.amount-3632", row.amount)

            var rem = remaning_amount - row.amount;

            log.debug("po line removed->rem", rem);

            addorUpdate({
              id: row.budget.id,
              rem: rem,
              utilised: row.amount * billExchangeRateVal,
              org_utilised: 0//toNum(row.budget.custrecord_utilised_amount)
            });

          }
        }
      }


      if (new_bill_financial_year != old_bill_financial_year

        && old_bill_financial_year != po_financial_year

        && new_bill_financial_year != po_financial_year
      ) {

        log.debug("2nd if condition", "new_bill_financial_year != old_bill_financial_year && old_bill_financial_year != po_financial_year", true)

        //old bill financial year budget is released

        var item_release_list = ITEM_LIST.filter(function (c) {
          if (c.budget) return c;
        }).map(function (c) {
          return {
            budget: c.budget.id,
            oldLine: {
              amount: c.amount * billExchangeRateVal,
            }
          };
        });

        RELEASE_LIST = RELEASE_LIST.concat(item_release_list);



        for (var i = 0; i < lineitems.length; i++) {
          var row = lineitems[i];

          if (row.budget) {

            var remaning_amount = toNum(getBudgetRemaining(row));

            var rem = remaning_amount - row.amount;

            log.debug("po line removed->rem", rem);

            addorUpdate({
              id: row.budget.id,
              rem: rem,
              utilised: row.amount * billExchangeRateVal,
              org_utilised: 0//toNum(row.budget.custrecord_utilised_amount)
            });

          }
        }


      }


      if (old_bill_financial_year != new_bill_financial_year && new_bill_financial_year == po_financial_year) {


        log.debug("3nd if condition", "old_bill_financial_year!= new_bill_financial_year && new_bill_financial_year == po_financial_year", true)


        var item_release_list = ITEM_LIST.filter(function (c) {
          if (c.budget) return c;
        }).map(function (c) {
          return {
            budget: c.budget.id,
            oldLine: {
              amount: c.amount * billExchangeRateVal,
            }
          };
        });

        RELEASE_LIST = RELEASE_LIST.concat(item_release_list);



      }


    }

  }

  function findBudget(fundcenters, commit_items, financial_year) {
    log.debug("budget + fundcenter, commititems & financialYear", fundcenters + " , " + commit_items + " , " + financial_year)
    if (!Array.isArray(fundcenters))
      fundcenters = removeNullOrDefault([fundcenters]);
    log.debug("fundcenters-4236", fundcenters)

    if (!Array.isArray(commit_items))
      commit_items = removeNullOrDefault([commit_items]);
    log.debug("commit_items-4240", commit_items)
    log.debug("financial_year-4241", financial_year);

    log.debug("fundcenters.length", fundcenters.length)
    log.debug("commit_items.length", commit_items.length)

    if (fundcenters.length > 0 && commit_items.length > 0) {
      var budgetReq = {
        type: "customrecord_budget",
        filters: [
          ["isinactive", "is", false],
          "AND",
          ["custrecord_commitment_item_name", "anyof", commit_items],
          "AND",
          ["custrecord_fund_center_name", "anyof", fundcenters],
          "AND",
          ["custrecord_financial_year", "anyof", financial_year],
        ],
        columns: [
          "custrecord_budget_type",
          "custrecord_fund_center_name",
          "custrecord_budget_amount",
          "custrecord_released_amount",
          "custrecord_yet_to_released",
          "custrecord_utilised_amount",
          "custrecord_yet_to_be_utilised",
          "custrecord_date_created_on",
          "custrecord_release_return",
          "custrecord_budget_return",
          "custrecord_commitment_item_name",
        ],
      };

      var res = getSearch(budgetReq.type, budgetReq.filters, budgetReq.columns);
      log.debug("res", res.length)
      return res
    } else {
      return [];
    }
  }

  function findFundCenter(subsidiary, cc_list) {

    var req = {
      type: "customrecord_fund_center_budget",
      filters: [
        ["isinactive", "is", false],
        "AND",
        ["custrecord_subsidiary_budget", "anyof", subsidiary],
        "AND",
        ["custrecord_cost_center_budget", "anyof", cc_list]
      ],
      columns: [
        "custrecord_subsidiary_budget",
        "custrecord_item_budget",
        "custrecord_fund_center_list_name",
        "custrecord_location_budget",
        "custrecord_cost_center_budget",
        "custrecord_deparment_tagging",
      ],
    };
    return getSearch(req.type, req.filters, req.columns);
  }



  function findFundCenterExpense(subsidiary, cc_list) {

    var req = {
      type: "customrecord_fund_center_budget",
      filters: [
        ["isinactive", "is", false],
        "AND",
        ["custrecord_subsidiary_budget", "anyof", subsidiary],
        "AND",
        ["custrecord_cost_center_budget", "anyof", cc_list],
        "AND",
        ["custrecord_item_budget", "anyof", "@NONE@"]
      ],
      columns: [
        "custrecord_subsidiary_budget",
        "custrecord_item_budget",
        "custrecord_fund_center_list_name",
        "custrecord_location_budget",
        "custrecord_cost_center_budget",
        "custrecord_deparment_tagging",
      ],
    };
    return getSearch(req.type, req.filters, req.columns);
  }
  return {
    onRequest: onRequest,
  };
});

function geOldSubLine(sublist, lineuniquekey) {
  log.debug("geOldSubLine->sublist", sublist);
  log.debug("geOldSubLine->lineuniquekey", lineuniquekey);
  if (MODE == "edit") {
    if (sublist == "item") {
      var res = ITEM_LIST.filter(function (c, i, a) {
        if (toNum(lineuniquekey) >= 0) {
          if (c.custcol_line_unique_key == lineuniquekey) return c;
        } else {
          // if (c.item == item && i == index)
          //     return c;
        }
      });
      log.debug("old line found", res);
      //line is found in old record
      if (res.length > 0) {
        return res[0];
      }
    } else {
      var res = EXPENSE_LIST.filter(function (c, i, a) {
        if (lineuniquekey) {
          if (c.custcol_line_unique_key == lineuniquekey) return c;
        } else {
          // if (c.account == item && i == index)
          //     return c;
        }
      });

      //line is found in old record
      if (res.length > 0) {
        return res[0];
      }
    }
  }
}

/*--------------------------HELPER FNS----------------------------------------*/
function sum(arr, k) {
  if (Array.isArray(arr)) {
    var ar;
    if (k)
      ar = arr.map(function (x) {
        return toNum(x[k]);
      });
    else ar = arr;

    return ar.reduce(function (a, b) {
      return a + b;
    }, 0);
  } else if (Array.isArray(k) && typeof arr === "object") {
    var values = k.map(function (c) {
      return arr[c];
    });
    return sum(values);
  }
}

function toNum(s) {
  s = Number(s);
  if (isNaN(s)) return 0;
  else return roundToTwo(s);
}

function toNumRaw(s) {
  s = parseFloat(s);
  if (isNaN(s)) return 0;
  else return s;
}


function getLines(rec, sublist, cols) {
  var result = [];
  var lineCount = rec.getLineCount(sublist);
  for (var i = 0; i < lineCount; i++) {
    var row = {
      line: i,
      index: i,
    };
    for (var j = 0; j < cols.length; j++) {
      try {
        row[cols[j]] = rec.getSublistValue({
          fieldId: cols[j],
          sublistId: sublist,
          line: i,
        });
      } catch (e) {
        // log.error("getLines:getSublistValue failed",e)
      }
      try {
        row[cols[j] + "_txt"] = rec.getSublistText({
          fieldId: cols[j],
          sublistId: sublist,
          line: i,
        });
      } catch (e) {
        // log.error("getLines:getSublistText failed",e)
      }
    }
    result.push(row);
  }
  return result;
}

function getValue(rec, fieldId) {
  return rec.getValue({
    fieldId: fieldId,
  });
}

function setValue(rec, fieldId, value) {
  return rec.setValue({
    fieldId: fieldId,
    value: value,
  });
}

function getLine(rec, sublist, col, line) {
  if (Array.isArray(col)) {
    var result = {};
    for (var key in col) {
      result[key] = rec.getSublistValue({
        sublistId: sublist,
        fieldId: key,
        line: line,
      });
    }
    return result;
  } else {
    return rec.getSublistValue({
      sublistId: sublist,
      fieldId: col,
      line: line,
    });
  }
}

function getLineText(rec, sublist, col, line) {
  if (Array.isArray(col)) {
    var result = {};
    for (var key in col) {
      result[key] = rec.getSublistText({
        sublistId: sublist,
        fieldId: key,
        line: line,
      });
    }
    return result;
  } else {
    return rec.getSublistText({
      sublistId: sublist,
      fieldId: col,
      line: line,
    });
  }
}

function getSearch(type, filters, columns) {
  try {
    const HARD_LIMIT = 10000;
    var dynamic_search;
    if (typeof type === "string" || type instanceof String) {
      dynamic_search = SEARCH.create({
        type: type,
        filters: filters,
        columns: columns,
      });
    } else {
      dynamic_search = type;
      columns = JSON.parse(JSON.stringify(dynamic_search)).columns;
    }

    var result_out = [];
    var myPagedData = dynamic_search.runPaged({ pageSize: 1000 });
    myPagedData.pageRanges.forEach(function (pageRange) {
      if (result_out.length < HARD_LIMIT) {
        var myPage = myPagedData.fetch({
          index: pageRange.index,
        });
        myPage.data.forEach(function (res) {
          var values = {
            id: res.id,
          };
          //iterate over the collection of columns for the value
          columns.forEach(function (c, i, a) {
            var key_name = "";

            if (c.join) key_name = c.join + "_" + c.name;
            else if (c.name.indexOf("formula") > -1)
              key_name = c.name + "_" + i;
            else key_name = c.name;

            var value = res.getText(c);

            if (value == null) {
              values[key_name] = res.getValue(c);
            } else {
              values[key_name] = res.getValue(c);

              values[key_name + "_txt"] = res.getText(c);
            }
          });
          result_out.push(values);
        });
      }
    });
    return result_out;
  } catch (e) {
    log.error("getSearch failed due to an exception", e);
    throw e;
  }
}

function getRecord(type, id, cols, map) {
  var rec = RECORD.load({
    type: type,
    id: id,
  });

  var result = {};

  for (var key in cols) {
    result[key] = rec.getValue(key) || "";
    result[key + "_txt"] = rec.getText(key) || "";
  }

  if (Array.isArray(map)) {
    var mapobj = {};
    for (var i = 0; i < map.length; i++) {
      mapobj[map[i]] = result[col[i]];
      mapobj[map[i] + "_txt"] = result[col[i] + "_txt"];
    }
    return mapobj;
  } else {
    return result;
  }
}

function stringify(s) {
  try {
    return JSON.stringify(s, null, 1);
  } catch (e) {
    log.debug("stringify failed", e);
    return "";
  }
}

function showError(title, message) {
  log.error(title, message);
}

function showSuccess(title, message) {
  log.debug(title, message);
}

function groupBy(xs, key) {
  return xs.reduce(function (rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
}

function getParentId(current, list) {
  //remove the last from the array
  var names_split = current.name.split(" : ");

  //log.debug("names_split",names_split);

  var lookup_pattern = [];

  for (var i = 0; i < names_split.length; i++) {
    var temp = names_split.slice(0, names_split.length - 1 - i);
    //log.debug("temp",temp);
    if (temp.length > 0)
      lookup_pattern.push(
        temp.reduce(function (a, b) {
          return a + " : " + b;
        })
      );
  }
  //log.debug("lookup pattern", lookup_pattern)
  var result = [];

  for (var i = 0; i < lookup_pattern.length; i++) {
    var row = lookup_pattern[i];
    var res = list.filter(function (c) {
      if (c.name == row) {
        return c;
      }
    });
    if (res.length > 0) {
      result.push(res[0]);
    }
  }
  // log.debug("result",result)
  return result;
}

function pick(arrobj, key) {
  if (Array.isArray(arrobj) && typeof key === "string") {
    return arrobj.map(function (c) {
      return c[key];
    });
  } else if (Array.isArray(key) && typeof arrobj === "object") {
    return key.map(function (c) {
      return arrobj[c];
    });
  }
}

function unique(arr, key) {
  if (key) {
    return arr.filter(function (c, i, a) {
      var list = a.map(function (x) {
        return x[key];
      });
      if (list.indexOf(c[key]) == i) return c;
    });
  } else {
    return arr.filter(function (c, i, a) {
      if (a.indexOf(c) == i) return c;
    });
  }
}

function removeNullOrDefault(arr) {
  return arr.filter(function (c) {
    if (c != null && c != undefined && c != "") return c;
  });
}

function isNullorDefault(s) {
  if (s == undefined || s == null || s == "") return true;
  else return false;
}

function isFound(val, arr, key) {
  if (key) {
    var res = arr.filter(function (c) {
      if (c[key] == val) return c;
    });
    if (res.length > 0) return true;
  } else {
    var res = arr.filter(function (c) {
      if (c == val) return c;
    });
    if (res.length > 0) return true;
  }

  return false;
}

Object.assign = function (target) {
  var newTo = Object(target);
  for (var index = 1; index < arguments.length; index++) {
    var nextSource = arguments[index];
    if (nextSource !== null && nextSource !== undefined) {
      for (var nextKey in nextSource) {
        if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
          newTo[nextKey] = nextSource[nextKey];
        }
      }
    }
  }
  return newTo;
};

function roundToTwo(num) {
  return +(Math.round(num + "e+2") + "e-2");
}

function convertTOINR(num) {
  input = num;
  var n1, n2;
  num = num + '' || '';
  // works for integer and floating as well
  n1 = num.split('.');
  n2 = n1[1] || null;
  n1 = n1[0].replace(/(\d)(?=(\d\d)+\d$)/g, "$1,");
  num = n2 ? n1 + '.' + n2 : n1;
  return num;
}