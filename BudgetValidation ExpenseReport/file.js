let arr = [
  { id: 123, value: 1000 },
  { id: 123, value: 2000 },
  { id: 231, value: 1200 },
  { id: 231, value: 2000 },
];
var groupedBudget = {};
for (let i = 0; i < arr.length; i++) {
  var budgetId = arr[i].id;
  var value = arr[i].value;
  if (groupedBudget[budgetId]) {
    // var tempConsumedAmounnt = groupedBudget[budgetId].consumedAmount;
    groupedBudget[budgetId] += value;
  } else {
    groupedBudget[budgetId] = value + 34;
  }
}

console.log(groupedBudget);
