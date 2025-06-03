/**
 *@NApiVersion 2.x
 *@NScriptType Suitelet
 */
var TAG = ""
var BACK_TRACK = [];
var EXPENSE_LIST = [];
//GLOBALS FOR VALIDATION
var FUND_CENTER_LIST, OLD_DATE, MODE;
var EXP_LINES_REM_FLG, LOCATION_LIST, EXCHANGE_RATE, CURRENCY;
var RELEASE_LIST = []
const INR = 1;

define(['N/record', "N/search", "N/redirect",
    "SuiteScripts/budgets/Helper/pts_table_gen"], function (record, search, redirect, tableGen) {

        function onRequest(context) {
            try {
                var rec_id = context.request.parameters.rec_id;
                var rec_type = context.request.parameters.rec_type;
                TAG += rec_id + ":"
                var expense_report = record.load({
                    type: rec_type,
                    id: rec_id,
                    isDynamic: true
                });

                var lines = getLines(expense_report, "expense", [
                    'expenseaccount', 'quantity',
                    'rate', 'currency', 'exchangerate',
                    'amount', 'grossamt', 'memo', 'department', 'class', 'location',
                    'cseg_cost_centre', 'custcol_fund_center_pr', 'custcol_commitment_item_pr',
                    'custcol_line_unique_key', 'custcol_budget_validation_pending',
                    'custcol_budget_line_level'
                ]);



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

                updateGlobals(expense_report);

                var res = validateBudget(expense_report, lines);


                updateResponseToRecord(res, expense_report)


                if (res.errors.length == 0) {
                    updateBudgets(expense_report);
                    handleFinancialYearChange(expense_report);
                    handleLineRemoved(expense_report, lines);
                    releaseBudgets(expense_report);
                    updatePendingstatus(expense_report, lines);

                }

                expense_report.save({
                    ignoreMandatoryFields: true
                });

                releaseLock(rec_id)

                redirect.toRecord({
                    type: expense_report.type,
                    id: expense_report.id
                });

                log.debug("processing complete", new Date().getTime())
            } catch (e) {
                log.error(TAG + "error", e);
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


        function getDiscreteInterval() {

            var intervals = [
                3300, 3500, 3800, 4000,
                0, 300, 600, 900, 1000,
                1300, 1500, 1800, 2000,
                2300, 2500, 2800, 3000,
                4300, 4500, 4800, 5000
            ];

            var randominterval = getRandomInt(0, 20);

            return intervals[randominterval]
        }

        function getRandomInt(min, max) {
            min = Math.ceil(min);
            max = Math.floor(max);
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        function wait(ms) {
            var start = new Date().getTime();
            var end = start;
            while (end < start + ms) {
                end = new Date().getTime();
            }
        }




        function updateResponseToRecord(response, curRec) {
            var messages = [];

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

            if (error_msg.length > 0) {
                curRec.setValue("custbody_budget_error", error_msg);
            } else {
                curRec.setValue("custbody_budget_error", "");
            }


        }

        function updatePendingstatus(curRec, lineItems) {

            var isPending = false;

            var res = lineItems.filter(function (c, j) {
                if (c.budval_pending)
                    return c;
            })

            if (res.length > 0)
                isPending = true;

            curRec.setValue("custbody_validation_budget_pending", isPending);
        }


        function releaseBudgets(rec) {
            var release_obj = []

            for (var i = 0; i < RELEASE_LIST.length; i++) {

                var row = RELEASE_LIST[i];

                release_obj.push({
                    id: row.budget,
                    amount: row.oldLine.amount
                });
            }
            var group_budget = groupBy(release_obj, "id");
            var final_data = [];
            for (var key in group_budget) {
                final_data.push({
                    id: key,
                    total: roundToTwo(sum(group_budget[key], "amount"))
                })
            }
            log.debug("final_data", final_data);
            rec.setValue({
                fieldId: "custbody_budget_validate_ref",
                value: JSON.stringify({ utilised: BACK_TRACK, release: final_data })
            })
        }


        function handleLineRemoved(curRec, lineItems) {
            //obvious removal of lines
            if (MODE == "edit") {
                var item_line_count = curRec.getLineCount("expense");
                if (item_line_count != EXPENSE_LIST.length || EXP_LINES_REM_FLG) {
                    for (var i = 0; i < EXPENSE_LIST.length; i++) {
                        var oldline = EXPENSE_LIST[i];
                        if (CURRENCY != INR) {
                            oldline.amount = oldline.amount * oldline.exchangerate;
                        }
                        var current_line = lineItems.filter(function (c, j) {
                            if (c.expenseaccount == oldline.expenseaccount && c.custcol_line_unique_key == oldline.custcol_line_unique_key)
                                return c;
                        });
                        if (current_line.length == 0) {
                            RELEASE_LIST.push({
                                budget: oldline.budget.id,
                                oldLine: oldline
                            })
                        }
                    }
                }
            }

            log.debug("handleLineRemoved", RELEASE_LIST);

        }



        function updateBudgets(rec) {
            rec.setValue({
                fieldId: "custbody_budget_validate_ref",
                value: JSON.stringify({ utilised: BACK_TRACK })
            })
        }

        function handleFinancialYearChange(rec) {

            var currentDate = rec.getValue("trandate");
            var old_financial_year = getFinancialyear(OLD_DATE || currentDate);
            var new_financial_year = getFinancialyear(currentDate);
            log.debug(TAG + 'old financial year', old_financial_year);
            log.debug(TAG + 'new financial year', new_financial_year);
            if (old_financial_year != new_financial_year) {

                var exp_release_list = EXPENSE_LIST.filter(function (c) {
                    if (c.budget)
                        return c;
                }).map(function (c) {
                    var amount = 0;

                    if (CURRENCY == INR)
                        amount = c.amount;
                    else
                        amount = c.amount * c.exchangerate
                    return {
                        budget: c.budget.id,
                        oldLine: {
                            amount: amount
                        }
                    };
                });
                RELEASE_LIST = RELEASE_LIST.concat(exp_release_list);
            }
        }

        function updateGlobals(tranrec) {

            var oldRec = getOldData(tranrec);

            log.debug(TAG + "oldRec", oldRec);

            MODE = oldRec.MODE;
            EXPENSE_LIST = oldRec.EXPENSE_LIST;

            OLD_DATE = new Date(oldRec.OLD_DATE);
            ITEM_LINES_REM_FLG = oldRec.ITEM_LINES_REM_FLG;

            var locationSer = {
                type: "location",
                filters: [["isinactive", "is", false]],
                columns: ["name", "custrecord_parent_budget"]
            };

            LOCATION_LIST = getSearch(locationSer.type, locationSer.filters, locationSer.columns)

            log.debug(TAG + "location loaded", LOCATION_LIST);

            for (var i = 0; i < LOCATION_LIST.length; i++) {
                LOCATION_LIST[i].parent = getParentId(LOCATION_LIST[i], LOCATION_LIST);
            }

            var fundCenterSer = {
                type: "customrecord_fund_center_list",
                columns: ["name"],
                filters: []
            };

            FUND_CENTER_LIST = getSearch(fundCenterSer.type, fundCenterSer.filter, fundCenterSer.columns)

        }

        function getParentId(current, list) {
            //remove the last from the array
            var names_split = current.name.split(" : ")

            //log.debug("names_split",names_split);
            var lookup_pattern = []

            for (var i = 0; i < names_split.length; i++) {
                var temp = names_split.slice(0, names_split.length - 1 - i)
                //log.debug("temp",temp); 
                if (temp.length > 0)
                    lookup_pattern.push(temp.reduce(function (a, b) { return a + " : " + b }))
            }
            //log.debug("lookup pattern", lookup_pattern)
            var result = [];

            for (var i = 0; i < lookup_pattern.length; i++) {
                var row = lookup_pattern[i];
                var res = list.filter(function (c) {
                    if (c.name == row) {
                        return c;
                    }
                })
                if (res.length > 0) {
                    result.push(res[0])
                }
            }
            return result;
        }



        function getOldData(rec) {
            try {

                var json = rec.getValue("custbody_old_record_date");

                return JSON.parse(json);

            } catch (e) {
                log.error(TAG + "getOldData", e);
                return {}
            }

        }


        function validateBudget(newRec, lines) {
            var res = {
                errors: [],
                warning: []
            };
            try {
                var budgetResponse = getExpenseBudgets(newRec, lines);
                log.debug("budgetResponse", budgetResponse);

                if (budgetResponse.errors.length == 0) {

                    for (var i = 0; i < lines.length; i++) {
                        var line = i + 1;
                        var row = lines[i];
                        log.debug("row", row)

                        var oldline = geOldSubLine("expense", row.custcol_line_unique_key)
                        if (oldline) {
                            if (oldline.budget) {
                                var currentDate = newRec.getValue('trandate');
                                var financial_year = getFinancialyear(currentDate)
                                var old_financial_year = getFinancialyear(OLD_DATE || currentDate);

                                if (row.budget.id != oldline.budget.id && financial_year == old_financial_year) {
                                    RELEASE_LIST.push({ budget: oldline.budget.id, oldLine: oldline });
                                }
                            }
                        }

                        var amount = getLineAmount(newRec, row);
                        var remaning_amount = getBudgetRemaining(row);

                        if (row.currency != INR) {
                            amount = amount * row.exchangerate;
                        }

                        log.debug(TAG + "currentline amount", amount);
                        log.debug(TAG + "currentline remaning_amount", remaning_amount);

                        if (amount > remaning_amount) {
                            row.budval_pending = true;
                            var warning = getWarning(row, line, "item", amount);

                            res.errors.push(warning)

                            newRec.selectLine({
                                sublistId: "expense",
                                line: i
                            });

                            newRec.setCurrentSublistValue({
                                sublistId: "expense",
                                fieldId: "custcol_budget_validation_pending",
                                value: true
                            });

                            newRec.commitLine({
                                sublistId: "expense"
                            });

                            if (MODE == "edit" && oldline.budget) {
                                RELEASE_LIST.push({ budget: oldline.budget.id, oldLine: oldline });

                                newRec.selectLine({
                                    sublistId: "expense",
                                    line: i
                                });

                                setColumns(newRec, "expense",
                                    ["custcol_fund_center_pr",
                                        "custcol_commitment_item_pr",
                                        "custcol_budget_line_level",
                                        "custcol_amount_not_utilised",
                                        "custcol_utilized_amount_001",
                                        "custcol_budget_validation_pending"],
                                    [
                                        null,
                                        null,
                                        null,
                                        0,
                                        0,
                                        true
                                    ]);

                                newRec.commitLine({
                                    sublistId: "expense"
                                });
                            }
                            continue;
                        } else {
                            //do the remaining calc
                            var rem = remaning_amount - amount;
                            if (rem >= 0) {
                                addorUpdate({
                                    id: row.budget.id,
                                    rem: rem,
                                    utilised: amount,
                                    org_utilised: 0// toNum(row.budget.custrecord_utilised_amount)
                                });
                            }

                            var utilised_row = BACK_TRACK.filter(function (c) {
                                if (c.id == row.budget.id)
                                    return c;
                            })

                            if (utilised_row.length > 0)
                                utilised_row = utilised_row[0]

                            newRec.selectLine({
                                sublistId: "expense",
                                line: i
                            });

                            log.debug("expense", [
                                row.fundCenter.custrecord_fund_center_list_name,
                                row.commitmentItem.id,
                                row.budget.id,
                                rem,
                                utilised_row.utilised,
                                false
                            ])

                            setColumns(newRec, "expense",
                                ["custcol_fund_center_pr",
                                    "custcol_commitment_item_pr",
                                    "custcol_budget_line_level",
                                    "custcol_amount_not_utilised",
                                    "custcol_utilized_amount_001",
                                    "custcol_budget_validation_pending"],
                                [
                                    row.fundCenter.custrecord_fund_center_list_name,
                                    row.commitmentItem.id,
                                    row.budget.id,
                                    roundToTwo(rem),
                                    roundToTwo(toNum(utilised_row.utilised) + toNum(row.budget.custrecord_utilised_amount)),
                                    false
                                ]
                            );
                            newRec.commitLine({
                                sublistId: "expense"
                            });
                        }
                    }
                } else {
                    return budgetResponse;
                }

                return res;

            } catch (e) {
                log.error(TAG + "validate budget failed", e);
                res.errors.push({
                    title: "Main Exception",
                    message: e.message
                })
                return res;
            }
        }


        function geOldSubLine(sublist, lineuniquekey) {
            if (MODE == "edit") {
                var res = EXPENSE_LIST.filter(function (c, i, a) {
                    if (lineuniquekey) {
                        if (c.custcol_line_unique_key == lineuniquekey)
                            return c;
                    } else {
                        // if (c.account == item && i == index)
                        //     return c;
                    }
                })

                //line is found in old record
                if (res.length > 0) {
                    return res[0];
                }

            }
        }


        function setColumns(record, sublist, cols, values) {

            if (Array.isArray(cols)) {
                cols.forEach(function (c, i) {
                    record.setCurrentSublistValue({
                        sublistId: sublist,
                        fieldId: c,
                        value: values[i]
                    });

                })
            }

        }
        function getSearch(type, filters, columns) {
            try {
                const HARD_LIMIT = 10000;
                var dynamic_search
                if (typeof type === 'string' || type instanceof String) {
                    dynamic_search = search.create({
                        type: type,
                        filters: filters,
                        columns: columns
                    });

                } else {
                    dynamic_search = type
                    columns = JSON.parse(JSON.stringify(dynamic_search)).columns
                }

                var result_out = [];
                var myPagedData = dynamic_search.runPaged({ pageSize: 1000 });
                myPagedData.pageRanges.forEach(function (pageRange) {
                    if (result_out.length < HARD_LIMIT) {
                        var myPage = myPagedData.fetch({
                            index: pageRange.index
                        });
                        myPage.data.forEach(function (res) {
                            var values = {
                                id: res.id
                            };
                            //iterate over the collection of columns for the value
                            columns.forEach(function (c, i, a) {

                                var key_name = "";

                                if (c.join)
                                    key_name = c.join + "_" + c.name
                                else if (c.name.indexOf("formula") > -1)
                                    key_name = c.name + "_" + i
                                else
                                    key_name = c.name;

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
            }

            catch (e) {
                log.error(TAG + "getSearch failed due to an exception", e);
                throw e;
            }
        }





        function addorUpdate(updaterow) {

            var res = BACK_TRACK.filter(function (c) {
                if (c.id == updaterow.id)
                    return c;
            })

            if (res.length == 0) {

                BACK_TRACK.push({
                    id: updaterow.id,
                    rem: roundToTwo(updaterow.rem),
                    utilised: roundToTwo(updaterow.org_utilised + updaterow.utilised)
                });

            } else {
                res[0].utilised += roundToTwo(updaterow.utilised);
                res[0].rem = roundToTwo(updaterow.rem);
            }
        }

        function getExpenseBudgets(rec, explines) {
            var errors = [];
            var budgets = [];

            var cost_center = rec.getValue("cseg_cost_centre")
            var cc_list = pick(explines, "cseg_cost_centre");

            cc_list.push(cost_center);
            cc_list = removeNullOrDefault(cc_list)
            log.debug(TAG + "cc list", cc_list);
            var trandate = rec.getValue('trandate');
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
                    message: "please select the cost center on line or body level and try again",
                    tech_details: ""
                })
            }

            if (errors.length > 0) {
                return {
                    errors: errors,
                    budgets: budgets
                }
            }

            var subsidiary = rec.getValue("subsidiary")

            var fundRes = findFundCenter(subsidiary, cc_list);
            log.debug("fundRes>>>", fundRes)
            //[sub,cc] or [sub,item,cc]
            for (var i = 0; i < explines.length; i++) {
                var row = explines[i];
                var res = fundRes.filter(function (c) {
                    var cc = row.cseg_cost_centre
                    if (!cc) {
                        cc = cost_center
                    }

                    if (c.custrecord_cost_center_budget == cc)
                        return c;
                });
                if (res.length > 0) {
                    row.fundCenter = res[0]
                } else {
                    // errors.push({
                    //     title: "fundcenter not found",
                    //     message: " Fund centre tagging is missing. Please create following records before proceeding further. 1. Fund Centre ( if new fund centre name is required). 2. Fund Centre Tagging. 3. Fund Centre to Commitment Item tagging. 4. Initial Budget. 5. Release Budget." + (i + 1) + " with account " + row.account_txt
                    //     // message: "fundcenter item not found for line " + (i + 1) + " with account " + row.account_txt
                    // })

                    // var msg = ""

                    // msg += "Fund Centre is missing. Please create following records before proceeding further." + "<br/>";
                    // msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
                    // msg += "2. Fund Centre Tagging." + "<br/>";
                    // msg += "3. Fund Centre to Commitment Item tagging. " + "<br/>";
                    // msg += "4. Initial Budget" + "<br/>";
                    // msg += " 5. Release Budget" + "<br/>";


                    // var techVal = ""
                    // techVal += "Account = " + row.account_txt + "<br/>"
                    // techVal += "Line = " + (i + 1) + "<br/>"
                    // techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
                    // if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
                    //   techVal += "Location = " + row.location_txt
                    // } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
                    //   techVal += "Department = " + row.department_txt
                    // } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
                    //   techVal += "Cost Center = " + row.cseg_cost_centre_txt
                    // }

                    // errors.push({
                    //   title: "FUND CENTER NOT FOUND",
                    //   message: msg,
                    //   tech_details: techVal
                    // });




                }
            }

            var accountList = unique(pick(explines, "expenseaccount"));
            log.debug(TAG + "accountList", accountList);
            var cmRes = findCommitmentItems(accountList);
            log.debug(TAG + "cmRes", cmRes);
            for (var i = 0; i < explines.length; i++) {
                var row = explines[i];
                var res = cmRes.filter(function (c) {
                    if (c.custrecord_gl_account.indexOf(row.expenseaccount) != -1)
                        return c;
                });
                if (res.length > 0) {
                    row.commitmentItem = res[0]
                } else {
                    // errors.push({
                    //     title: "commitment item not found",
                    //     message: "Commitment item tagging is missing. Please create following records before proceeding further. 1. Commitment Item and its Tagging. 3. Fund Centre to Commitment Item tagging. 4. Initial Budget . 5. Release Budget" + (i + 1) + row.expenseaccount_txt 
                    //     //message: "commitment item not found for the line " + (i + 1) + row.expenseaccount_txt
                    // })



                    // var msg = ""
                    // msg += "Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>"
                    // msg += " 1. Commitment Item and its Tagging." + "<br/>"
                    // msg += " 2. Fund Centre to Commitment Item tagging." + "<br/>"
                    // msg += " 3. Initial Budget." + "<br/>"
                    // msg += " 4. Release Budget" + "<br/>"

                    // var techDetaii = ""
                    // techDetaii += "Account = " + row.account_txt + "<br/>"
                    // techDetaii += "Line = " + (i + 1) + "<br/>"
                    // techDetaii += "Fund Center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "<br/>"
                    // if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
                    //     techDetaii += "Location = " + row.location_txt
                    // } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
                    //     techDetaii += "Department = " + row.department_txt
                    // } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
                    //     techDetaii += "Cost Center = " + row.cseg_cost_centre_txt
                    // }


                    // errors.push({
                    //     title: "COMMITMENT ITEM NOT FOUND",
                    //     message: msg,
                    //     tech_details: techDetaii
                    // });

                }
            }
            log.debug(TAG + "explines commit and res", explines);
            for (var i = 0; i < explines.length; i++) {
                var row = explines[i];
                // if (!row.fundCenter || !row.commitmentItem) {
                //     errors.push({
                //         title: "FUNDCENTER/COMMITMENT NOT FOUND",
                //         message: "Fund Centre & Commitment Item taggings are missing. Please create following records before proceeding further. 1. Fund Centre ( if new fund centre name is required). 2. Fund Centre Tagging. 3. Commitment Item and its Tagging. 4. Fund Centre to Commitment Item tagging. 5. Initial Budget. 6. Release Budget" + row.expenseaccount_txt + 'on the line ' + i
                //         //message: "fund center or commitment item not found for item " + row.expenseaccount_txt + 'on the line ' + i
                //     })
                // }

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
                    techVal += "Account = " + row.expenseaccount_txt + "<br/>"
                    techVal += "Line = " + i + "<br/>"
                    techVal += "Cost Center = " + row.cseg_cost_centre_txt

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
                        techVal += "Account = " + row.expenseaccount_txt + "<br/>"
                        techVal += "Line = " + i + "<br/>"
                        techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
                        techVal += "Cost Center = " + row.cseg_cost_centre_txt


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
                        techDetaii += "Account = " + row.expenseaccount_txt + "<br/>"
                        techDetaii += "Line = " + i + "<br/>"
                        techDetaii += "Fund Center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "<br/>"
                        techDetaii += "Cost Center = " + row.cseg_cost_centre_txt



                        errors.push({
                            title: "COMMITMENT ITEM NOT FOUND",
                            message: msg,
                            tech_details: techDetaii
                        });

                    }
                }





            }

            if (errors.length == 0) {
                var commitment_items = pick(pick(explines, "commitmentItem"), "id");
                var fundcenter = pick(pick(explines, "fundCenter"), "custrecord_fund_center_list_name");
                budgets = findBudget(fundcenter, commitment_items, financial_year);
                for (var i = 0; i < explines.length; i++) {
                    var row = explines[i];
                    var line = i + 1;
                    var res = budgets.filter(function (c) {
                        if (c.custrecord_fund_center_name == row.fundCenter.custrecord_fund_center_list_name
                            && c.custrecord_commitment_item_name == row.commitmentItem.id)
                            return c;
                    });
                    if (res.length > 0)
                        row.budget = res[0];
                    else {
                        // errors.push({
                        //     title: "budget not found on the expense line",
                        //     message: "Budget with Fund Centre & Commitment Item not found. Please create following records before proceeding further. 1. Initial Budget. 2. Release Budget." + line + " account " + row.expenseaccount_txt 
                        //     //message: "budget not found for expense on the line " + line + " account " + row.expenseaccount_txt
                        // });



                        var msg = ""

                        msg += "Budget not found. Please create following records before proceeding further." + "<br/>"
                        msg += "1. Fund Centre to Commitment Item Tagging (if not created before)" + "<br/>"
                        msg += "2. Initial Budget." + "<br/>"
                        msg += "3. Release Budget"

                        var techVal = ""
                        techVal += "Account = " + row.expenseaccount_txt + "<br/>"
                        techVal += "Line = " + i + "<br/>"
                        techVal += "Fund Center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "<br/>"
                        techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
                        techVal += "Cost Center = " + row.cseg_cost_centre_txt

                        errors.push({
                            title: "Budget not found on the expense line",
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
                            line: row.line
                        });

                        if (!row.fundCenter)
                            rec.setCurrentSublistValue({
                                sublistId: "expense",
                                fieldId: "custcol_fund_center_pr",
                                value: ""
                            });

                        if (!row.commitmentItem)
                            rec.setCurrentSublistValue({
                                sublistId: "expense",
                                fieldId: "custcol_commitment_item_pr",
                                value: ""
                            });

                        rec.commitLine({
                            sublistId: "expense"
                        });
                    }
                }
            }
            return {
                errors: errors,
                budgets: budgets
            };
        }

        function findBudget(fundcenters, commit_items, financial_year) {
            if (!Array.isArray(fundcenters))
                fundcenters = removeNullOrDefault([fundcenters])

            if (!Array.isArray(commit_items))
                commit_items = removeNullOrDefault([commit_items]);

            if (fundcenters.length > 0 && commit_items.length > 0) {
                var budgetReq = {
                    type: "customrecord_budget",
                    filters:
                        [
                            ["isinactive", "is", false],
                            "AND",
                            ["custrecord_commitment_item_name", "anyof", commit_items],
                            "AND",
                            ["custrecord_fund_center_name", "anyof", fundcenters],
                            "AND",
                            ["custrecord_financial_year", "anyof", financial_year]
                        ],
                    columns:
                        [
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
                            "custrecord_commitment_item_name"
                        ]
                }
                return getSearch(budgetReq.type, budgetReq.filters, budgetReq.columns);
            } else {
                return []
            }
        }


        function findCommitmentItems(accountList) {

            var cm_req = {
                type: "customrecord_coa_commit_items_budget",
                filters:
                    [
                        ["isinactive", "is", false],
                        "AND",
                        ["custrecord_gl_account", "anyof", accountList]
                    ],
                columns:
                    [
                        "name",
                        "custrecord_gl_account"
                    ]
            }

            return getSearch(cm_req.type, cm_req.filters, cm_req.columns);
        }

        function findFundCenter(subsidiary, cc_list) {
            var req = {
                type: "customrecord_fund_center_budget",
                filters:
                    [
                        ["isinactive", "is", false],

                        "AND",
                        ["custrecord_subsidiary_budget", "anyof", subsidiary],
                        "AND",
                        ["custrecord_cost_center_budget", "anyof", cc_list],
                        "AND",
                        ["custrecord_item_budget", "anyof", "@NONE@"]
                    ],
                columns:
                    [
                        "custrecord_subsidiary_budget",
                        "custrecord_item_budget",
                        "custrecord_fund_center_list_name",
                        "custrecord_location_budget",
                        "custrecord_cost_center_budget",
                        "custrecord_deparment_tagging"
                    ]
            };
            return getSearch(req.type, req.filters, req.columns);
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
                log.debug(TAG + "remaining", remaining);
                return remaining
            } else if (budget.length > 0) {
                return budget[0].rem;
            } else {
                return 0;
            }
        }

        function getFinancialyear(trandate) {
            //var trandate = rec.getValue("trandate");
            var month = trandate.getMonth();
            var fullyear = parseInt(trandate.getFullYear());
            log.debug(TAG + "Month:" + month, "Year:" + fullyear);
            //if it is less than april take previous year
            if (month < 3) {
                fullyear -= 1;
            }
            fullyear = fullyear.toString();
            switch (fullyear) {
                // case "2018":
                //     return 1;
                // case "2019":
                //     return 2;
                // case "2020":
                //     return 3;
                // case "2021":
                //     return 4;
                // case "2022":
                //     return 5;
                // case "2023":
                //     return 6;
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

        function getLineAmount(rec, row) {
            var amount = 0;
            var currentDate = rec.getValue("trandate");
            var financial_year = getFinancialyear(currentDate)
            var old_financial_year = getFinancialyear(OLD_DATE || currentDate);
            //create mode
            if (MODE == 'edit') {

                var res = EXPENSE_LIST.filter(function (c, i) {
                    if (isNullorDefault(row.custcol_line_unique_key)) {
                        if (c.expenseaccount == row.expenseaccount
                            // && i == row.line
                            && c.custcol_commitment_item_pr == row.commitmentItem.id
                            && c.custcol_fund_center_pr == row.fundCenter.custrecord_fund_center_list_name
                            && financial_year == old_financial_year)
                            return c;

                    } else {
                        if (c.expenseaccount == row.expenseaccount
                            && c.custcol_line_unique_key == row.custcol_line_unique_key
                            && c.custcol_commitment_item_pr == row.commitmentItem.id
                            && c.custcol_fund_center_pr == row.fundCenter.custrecord_fund_center_list_name
                            && financial_year == old_financial_year)
                            return c;
                    }
                });
                if (res.length == 0)
                    amount = toNum(row.amount);
                else
                    amount = toNum(row.amount) - toNum(res[0].amount);

            } else if (MODE == "create" || MODE == "copy") {
                return toNum(row.amount)
            }
            return amount;
        }

        // function getWarning(row, line, type, amount) {
        //     var title = ""
        //     title = "Warn:Budget validation Pending for expense " + row.expenseaccount_txt + " on line:" + line

        //     var msg = "Budget:" + row.budget.id + "</br>"
        //     msg += "FundCenter:" + row.fundCenter.custrecord_fund_center_list_name_txt + "</br>"
        //     msg += "CommitmentItem:" + row.commitmentItem.name + "</br>"
        //     msg += "The Budget amount is INR Rs." +  convertTOINR(toNum(row.amount)) + " Transaction Amount is INR Rs." + convertTOINR(toNum(getBudgetRemaining(row)))
        //     msg += ". Budget Amount is short by INR Rs." + convertTOINR(toNum(amount - getBudgetRemaining(row))) + ". " + " " + " Kindly release more budget before proceeding further."
        //     // msg += "The amount Rs." +  convertTOINR(toNum(row.amount)) + " is greater than the remaining budget Rs." + convertTOINR(toNum(getBudgetRemaining(row)))
        //     // msg += ". Budget is short by Rs." + convertTOINR(toNum(amount - getBudgetRemaining(row)))

        //     var warning = {
        //         title: title,
        //         message: msg
        //     };
        //     return warning;
        // }


        function getWarning(row, line, type, amount) {

            var title = "";
            if (type == "item")
                title =
                    "Warn:Budget validation Pending for item " +
                    row.expenseaccount_txt +
                    " on line:" +
                    line;
            else
                title =
                    "Warn:Budget validation Pending for expense " +
                    row.expenseaccount_txt +
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

        return {
            onRequest: onRequest
        }
    });

function getLines(rec, sublist, cols) {
    var result = [];
    var lineCount = rec.getLineCount(sublist);
    for (var i = 0; i < lineCount; i++) {
        var row = {
            line: i
        };
        for (var j = 0; j < cols.length; j++) {
            try {
                row[cols[j]] = rec.getSublistValue({
                    fieldId: cols[j],
                    sublistId: sublist,
                    line: i
                })
            } catch (e) {
                // log.error(TAG+"getLines:getSublistValue failed",e)
            }
            try {
                row[cols[j] + "_txt"] = rec.getSublistText({
                    fieldId: cols[j],
                    sublistId: sublist,
                    line: i
                })
            } catch (e) {
                // log.error(TAG+"getLines:getSublistText failed",e)
            }
        }
        result.push(row)
    }
    return result;
}

function groupBy(xs, key) {
    return xs.reduce(function (rv, x) {
        (rv[x[key]] = rv[x[key]] || []).push(x);
        return rv;
    }, {});
}

function pick(arrobj, key) {

    if (Array.isArray(arrobj) && typeof key === 'string') {
        return arrobj.map(function (c) {
            return c[key]
        })
    } else if (Array.isArray(key) && typeof arrobj === 'object') {
        return key.map(function (c) {
            return arrobj[c]
        })
    }
}

function unique(arr, key) {
    if (key) {
        return arr.filter(function (c, i, a) {
            var list = a.map(function (x) {
                return x[key]
            });
            if (list.indexOf(c[key]) == i)
                return c;
        })
    } else {
        return arr.filter(function (c, i, a) {
            if (a.indexOf(c) == i)
                return c;
        })
    }
}

function removeNullOrDefault(arr) {
    return arr.filter(function (c) {
        if (c != null && c != undefined && c != "")
            return c;
    });
}

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


    } else if (Array.isArray(k) && typeof arr === 'object') {
        var values = k.map(function (c) {
            return arr[c];
        })
        return sum(values)
    }
}

function toNum(s) {
    s = parseFloat(s);
    if (isNaN(s))
        return 0
    else
        return s;
}



function isNullorDefault(s) {
    if (s == undefined || s == null || s == "")
        return true;
    else
        return false;
}


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
    //console.log("Input:", input)
    //console.log("Output:", num)
    return num;
}