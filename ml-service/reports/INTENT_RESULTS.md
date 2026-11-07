# Chatbot intent classifier

3796 training sentences (655 originals + noisy variants), 12 intents, 4 languages. 5-fold cross-validation grouped by original sentence.

| model | accuracy | f1 | f1_en | f1_fr | f1_ar | f1_arabizi |
|---|---|---|---|---|---|---|
| Linear SVM | 0.8928 | 0.8207 | 0.8936 | 0.8286 | 0.7362 | 0.8035 |
| Logistic Regression | 0.8909 | 0.817 | 0.9077 | 0.8156 | 0.7342 | 0.7897 |
| Naive Bayes | 0.8799 | 0.8006 | 0.8831 | 0.7917 | 0.7175 | 0.771 |

Selected: **Linear SVM**

## Per intent (selected model)

```
                  precision    recall  f1-score   support

    account_help      0.996     0.979     0.988       284
    capabilities      0.837     0.802     0.819       192
complaint_status      0.932     0.915     0.923       468
   document_info      0.960     0.946     0.953       332
         goodbye      0.364     0.167     0.229       120
        greeting      0.746     0.625     0.680       160
   how_to_report      0.910     0.943     0.926       352
   human_contact      0.966     0.950     0.958       240
     points_info      1.000     0.908     0.952       196
  report_problem      0.859     0.996     0.922      1000
  request_status      0.878     0.949     0.912       312
          thanks      0.793     0.464     0.586       140

        accuracy                          0.893      3796
       macro avg      0.853     0.804     0.821      3796
    weighted avg      0.883     0.893     0.884      3796

```