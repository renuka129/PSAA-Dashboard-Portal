sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (
    Controller,
    JSONModel,
    MessageToast,
    MessageBox,
    Filter,
    FilterOperator
) {
    "use strict";

    const API = {
        timesheets: "/odata/v4/approval-srv/Timesheets",
        entries: "/odata/v4/timesheet-srv/TimesheetEntries",
        approve: "/odata/v4/approval-srv/approveTimesheet",
        reject: "/odata/v4/approval-srv/rejectTimesheet",
        projects: "/odata/v4/project-srv/Projects",
        employees: "/odata/v4/employee-srv/Employees",
        tasks: "/odata/v4/task-srv/Tasks",
        budgets: "/odata/v4/budget-srv/Budgets",
        invoices: "/odata/v4/invoice-srv/Invoices"
        };

    return Controller.extend("psaamanager.controller.Manager", {

        // Initialize dashboard model
        onInit: function () {
            this.getView().setModel(
                new JSONModel({
                    projects: [],
                    tasks: [],
                    budgets: [],
                    invoices: [],
                    allTimesheets: [],
                    timesheets: [],
                    selectedFilter: "ALL",
                    searchQuery: "",
                    entries: [],
                    selectedTimesheetID: "",
                    selectedEmployeeID: "",
                    selectedTotalHours: 0,
                    canReview: false,
                    pendingCount: 0,
                    approvedCount: 0,
                    rejectedCount: 0,
                    activeProjectsCount: 0,
                    activeTasksCount: 0,
                    atRiskBudgetsCount: 0,
                    draftInvoicesCount: 0,
                    outstandingInvoiceAmount: 0,
                    totalBudgetAmount: 0,
                    totalConsumedBudget: 0,
                    totalRemainingBudget: 0,
                    overallBudgetUtilization: 0,
                }),
                "managerModel"
            );

            this._taskMap = new Map();

            this._loadTimesheets();
        },

        // Common API request helper
        _request: async function (url, options = {}) {
            const response = await fetch(url, {
                credentials: "same-origin",
                ...options,
                headers: {
                    Accept: "application/json",
                    ...(options.body
                        ? { "Content-Type": "application/json" }
                        : {}),
                    ...(options.headers || {})
                }
            });

            const text = await response.text();

            let data = {};

            try {
                data = text ? JSON.parse(text) : {};
            } catch (error) {
                data = { message: text };
            }

            if (!response.ok) {
                throw new Error(
                    data.error?.message ||
                    data.message ||
                    `Request failed: ${response.status}`
                );
            }

            return data;
        },

        // Load timesheets, projects, employees and tasks
        _loadTimesheets: async function () {
            const view = this.getView();
            const model = view.getModel("managerModel");

            view.setBusy(true);

            try {
                const [
                    timesheetsResult,
                    projectsResult,
                    employeesResult,
                    tasksResult,
                    budgetsResult,
                    invoicesResult
                ] = await Promise.all([
                    this._request(API.timesheets + "?$orderby=weekStart desc"),
    this._request(API.projects),
    this._request(API.employees),
    this._request(API.tasks),
    this._request(API.budgets),
    this._request(API.invoices)
                ]);

                const projects = projectsResult.value || [];
                const employees = employeesResult.value || [];
                const tasks = tasksResult.value || [];
                const budgets = budgetsResult.value || [];
const invoices = invoicesResult.value || [];

                // Task ID -> task name
                this._taskMap = new Map(
                    tasks.map(function (task) {
                        return [
                            task.ID,
                            task.name ||
                            task.title ||
                            task.taskName ||
                            task.description ||
                            task.ID
                        ];
                    })
                );

                // Project ID -> project name
                const projectMap = new Map(
                    projects.map(function (project) {
                        return [
                            project.ID,
                            project.name ||
                            project.projectName ||
                            project.ID
                        ];
                    })
                );

                // Employee ID -> employee name
                const employeeMap = new Map(
                    employees.map(function (employee) {
                        return [
                            employee.ID,
                            employee.fullName ||
                            [
                                employee.firstName,
                                employee.lastName
                            ].filter(Boolean).join(" ") ||
                            employee.employeeNo ||
                            employee.ID
                        ];
                    })
                );

                // Normalize status values
const normalizeStatus = function (record) {
    return String(record.status || "")
        .trim()
        .toUpperCase();
};

// Project overview
const projectOverview = projects.map(function (project) {
    const status = normalizeStatus(project);

    return {
        ...project,
        status: status,
        projectName: project.name || project.projectName || project.ID,
        budgetAmount: Number(project.budgetAmount || 0),
        currency: project.currency || "INR"
    };
});

// Task overview
const taskOverview = tasks.map(function (task) {
    return {
        ...task,
        status: normalizeStatus(task),
        taskName: task.name || task.title || task.description || task.ID
    };
});


// Budget overview with remaining budget and utilization
const budgetOverview = budgets.map(function (budget) {
    const status = normalizeStatus(budget);
    const budgetAmount = Number(budget.budgetAmount || 0);
    const consumedAmount = Number(budget.consumedAmount || 0);

    const remainingAmount = budgetAmount - consumedAmount;

    const actualUtilization = budgetAmount > 0
        ? (consumedAmount / budgetAmount) * 100
        : (consumedAmount > 0 ? 100 : 0);

    // ProgressIndicator supports a maximum of 100%.
    const utilizationPct = Math.min(
        Math.max(actualUtilization, 0),
        100
    );

    let progressState = "Success";

    if (actualUtilization >= 100) {
        progressState = "Error";
    } else if (actualUtilization >= 75) {
        progressState = "Warning";
    }

    return {
        ...budget,
        status: status,
        projectName: projectMap.get(budget.project_ID)
            || budget.project_ID
            || "Unknown Project",
        budgetAmount: budgetAmount,
        consumedAmount: consumedAmount,
        remainingAmount: remainingAmount,
        utilizationPct: utilizationPct,
        utilizationText: actualUtilization.toFixed(1) + "%",
        progressState: progressState,
        currency: budget.currency || "INR"
    };
});

// Invoice overview
const invoiceOverview = invoices.map(function (invoice) {
    return {
        ...invoice,
        status: normalizeStatus(invoice),
        projectName: projectMap.get(invoice.project_ID)
            || invoice.project_ID
            || "Unknown Project",
        invoiceAmount: Number(invoice.totalAmount || 0),
        currency: invoice.currency || "INR"
    };
});

// Update dashboard collections
model.setProperty("/projects", projectOverview);
model.setProperty("/tasks", taskOverview);
model.setProperty("/budgets", budgetOverview);
const totalBudgetAmount = budgetOverview.reduce(
    (sum, budget) => sum + budget.budgetAmount,
    0
);

const totalConsumedBudget = budgetOverview.reduce(
    (sum, budget) => sum + budget.consumedAmount,
    0
);

const totalRemainingBudget =
    totalBudgetAmount - totalConsumedBudget;

const overallBudgetUtilization = totalBudgetAmount > 0
    ? Number(
        ((totalConsumedBudget / totalBudgetAmount) * 100).toFixed(1)
    )
    : 0;

model.setProperty("/totalBudgetAmount", totalBudgetAmount);
model.setProperty("/totalConsumedBudget", totalConsumedBudget);
model.setProperty("/totalRemainingBudget", totalRemainingBudget);
model.setProperty("/overallBudgetUtilization", overallBudgetUtilization);
model.setProperty("/invoices", invoiceOverview);

// Calculate KPI values
model.setProperty(
    "/activeProjectsCount",
    projectOverview.filter(function (project) {
        return project.status === "IN_PROGRESS";
    }).length
);

model.setProperty(
    "/activeTasksCount",
    taskOverview.filter(function (task) {
        return task.status === "OPEN" ||
               task.status === "IN_PROGRESS";
    }).length
);

model.setProperty(
    "/atRiskBudgetsCount",
    budgetOverview.filter(function (budget) {
        return budget.status === "AT_RISK" ||
               budget.status === "BREACHED";
    }).length
);

model.setProperty(
    "/draftInvoicesCount",
    invoiceOverview.filter(function (invoice) {
        return invoice.status === "DRAFT";
    }).length
);

// Sum issued invoices that are not yet paid
model.setProperty(
    "/outstandingInvoiceAmount",
    Number(
        invoiceOverview
            .filter(function (invoice) {
                return invoice.status === "ISSUED";
            })
            .reduce(function (total, invoice) {
                return total + invoice.invoiceAmount;
            }, 0)
            .toFixed(2)
    )
);

                // Prepare timesheet records
                const timesheets = (
                    timesheetsResult.value || []
                ).map(function (timesheet) {
                    const status = String(
                        timesheet.status || ""
                    ).trim().toUpperCase();

                    let statusState = "None";

                    if (status === "SUBMITTED") {
                        statusState = "Warning";
                    } else if (
                        status === "APPROVED" ||
                        status === "INVOICED"
                    ) {
                        statusState = "Success";
                    } else if (status === "REJECTED") {
                        statusState = "Error";
                    }

                    return {
                        ...timesheet,

                        status: status,
                        statusState: statusState,

                        employeeName:
                            employeeMap.get(timesheet.employee_ID) ||
                            timesheet.employee_ID ||
                            "Unknown Employee",

                        projectName:
                            projectMap.get(timesheet.project_ID) ||
                            timesheet.project_ID ||
                            "Unknown Project",

                        weekStart: String(
                            timesheet.weekStart || ""
                        ).slice(0, 10),

                        weekEnd: String(
                            timesheet.weekEnd || ""
                        ).slice(0, 10),

                        totalHours: Number(
                            timesheet.totalHours || 0
                        )
                    };
                });

                // Save complete list and apply current filters
                model.setProperty(
                    "/allTimesheets",
                    timesheets
                );

                this._applyTimesheetFilter();

                // Update KPI counts
                model.setProperty(
                    "/pendingCount",
                    timesheets.filter(function (item) {
                        return item.status === "SUBMITTED";
                    }).length
                );

                model.setProperty(
                    "/approvedCount",
                    timesheets.filter(function (item) {
                        return item.status === "APPROVED";
                    }).length
                );

                model.setProperty(
                    "/rejectedCount",
                    timesheets.filter(function (item) {
                        return item.status === "REJECTED";
                    }).length
                );

            } catch (error) {
                MessageBox.error(
                    "Unable to load manager dashboard: " +
                    error.message
                );
            } finally {
                view.setBusy(false);
            }
        },

        // Search by employee name or project name
        onSearchTimesheets: function (event) {
            const query = String(
                event.getParameter("newValue") ??
                event.getParameter("query") ??
                ""
            ).trim();

            this.getView()
                .getModel("managerModel")
                .setProperty("/searchQuery", query);

            this._applyTimesheetFilter();
        },

        // Apply status and search filters together

_applyTimesheetFilter: function () {
    const model = this.getView().getModel("managerModel");

    const allTimesheets = model.getProperty("/allTimesheets") || [];
    const selectedFilter = String(
        model.getProperty("/selectedFilter") || "ALL"
    ).trim().toUpperCase();

    const searchQuery = String(
        model.getProperty("/searchQuery") || ""
    ).trim().toLowerCase();

    let filteredTimesheets = allTimesheets;

    // Filter by selected status
    if (selectedFilter === "SUBMITTED") {
        filteredTimesheets = allTimesheets.filter(
            timesheet => timesheet.status === "SUBMITTED"
        );
    } else if (selectedFilter === "APPROVED") {
        filteredTimesheets = allTimesheets.filter(
            timesheet => timesheet.status === "APPROVED"
        );
    } else if (selectedFilter === "REJECTED") {
        filteredTimesheets = allTimesheets.filter(
            timesheet => timesheet.status === "REJECTED"
        );
    }

    // Search by employee or project while preserving the status filter
    if (searchQuery) {
        filteredTimesheets = filteredTimesheets.filter(timesheet =>
            (timesheet.employeeName || "")
                .toLowerCase().includes(searchQuery) ||
            (timesheet.projectName || "")
                .toLowerCase().includes(searchQuery)
        );
    }

    model.setProperty("/timesheets", filteredTimesheets);
},

        // Handle All, Pending, Approved and Rejected buttons
        onFilterChange: function (event) {
            const item = event.getParameter("item");

            if (!item) {
                return;
            }

            const key = String(item.getKey()).toUpperCase();

            this.getView()
                .getModel("managerModel")
                .setProperty("/selectedFilter", item.getKey());

            this._applyTimesheetFilter();
        },

        // Refresh dashboard
        onRefresh: async function () {
            await this._loadTimesheets();
            MessageToast.show("Timesheets refreshed.");
        },

        // Load entries when a timesheet is selected
        onTimesheetSelection: async function (event) {
            const item = event.getParameter("listItem");

            const context = item &&
                item.getBindingContext("managerModel");

            const timesheet = context && context.getObject();

            if (!timesheet) {
                return;
            }

            const model = this.getView().getModel("managerModel");

            model.setProperty(
                "/selectedTimesheetID",
                timesheet.ID
            );

            model.setProperty(
                "/selectedEmployeeID",
                timesheet.employee_ID
            );

            model.setProperty(
                "/selectedTotalHours",
                Number(timesheet.totalHours || 0)
            );

            model.setProperty(
                "/canReview",
                timesheet.status === "SUBMITTED"
            );

            model.setProperty("/entries", []);

            try {
                const filter = encodeURIComponent(
                    "timesheet_ID eq " + timesheet.ID
                );

                const result = await this._request(
                    API.entries + "?$filter=" + filter
                );

                const rawEntries = result.value || [];

                const entries = rawEntries.map(
                    function (entry) {
                        return {
                            ...entry,

                            taskName:
                                this._taskMap.get(entry.task_ID) ||
                                entry.task_ID ||
                                "Unknown Task"
                        };
                    }.bind(this)
                );

                model.setProperty("/entries", entries);

                const totalHours = rawEntries.reduce(
                    function (sum, entry) {
                        return sum + Number(entry.hours || 0);
                    },
                    0
                );

                model.setProperty(
                    "/selectedTotalHours",
                    Number(totalHours.toFixed(2))
                );

            } catch (error) {
                MessageBox.error(
                    "Unable to load timesheet entries: " +
                    error.message
                );
            }
        },

        // Approve a submitted timesheet
        onApprove: function () {
            const view = this.getView();
            const model = view.getModel("managerModel");

            const timesheetID = model.getProperty(
                "/selectedTimesheetID"
            );

            const canReview = model.getProperty("/canReview");

            if (!timesheetID) {
                MessageBox.warning(
                    "Select a timesheet first."
                );
                return;
            }

            if (!canReview) {
                MessageBox.warning(
                    "Only submitted timesheets can be approved."
                );
                return;
            }

            MessageBox.confirm(
                "Approve this timesheet?",
                {
                    title: "Approve Timesheet",

                    onClose: async function (action) {
                        if (action !== MessageBox.Action.OK) {
                            return;
                        }

                        view.setBusy(true);

                        try {
                            await this._request(API.approve, {
                                method: "POST",

                                body: JSON.stringify({
                                    timesheetID: timesheetID
                                })
                            });

                            model.setProperty("/canReview", false);

                            MessageToast.show(
                                "Timesheet approved."
                            );

                            await this._loadTimesheets();

                            // Clear selection after successful approval
                            this._clearSelection();

                        } catch (error) {
                            MessageBox.error(
                                "Approval failed: " +
                                error.message
                            );
                        } finally {
                            view.setBusy(false);
                        }
                    }.bind(this)
                }
            );
        },

        // Reject a submitted timesheet
        onReject: function () {
            const view = this.getView();
            const model = view.getModel("managerModel");

            const timesheetID = model.getProperty(
                "/selectedTimesheetID"
            );

            const reasonInput = view.byId("rejectReasonInput");

            const reason = reasonInput
                ? reasonInput.getValue().trim()
                : "";

            const canReview = model.getProperty("/canReview");

            if (!timesheetID) {
                MessageBox.warning(
                    "Select a timesheet first."
                );
                return;
            }

            if (!canReview) {
                MessageBox.warning(
                    "Only submitted timesheets can be rejected."
                );
                return;
            }

            if (!reason) {
                MessageBox.warning(
                    "Enter a rejection reason before rejecting."
                );
                return;
            }

            if (reason.length > 500) {
                MessageBox.warning(
                    "The rejection reason cannot exceed 500 characters."
                );
                return;
            }

            MessageBox.confirm(
                "Reject this timesheet?",
                {
                    title: "Reject Timesheet",

                    onClose: async function (action) {
                        if (action !== MessageBox.Action.OK) {
                            return;
                        }

                        view.setBusy(true);

                        try {
                            await this._request(API.reject, {
                                method: "POST",

                                body: JSON.stringify({
                                    timesheetID: timesheetID,
                                    reason: reason
                                })
                            });

                            if (reasonInput) {
                                reasonInput.setValue("");
                            }

                            model.setProperty("/canReview", false);

                            MessageToast.show(
                                "Timesheet rejected."
                            );

                            await this._loadTimesheets();

                            // Clear selection after successful rejection
                            this._clearSelection();

                        } catch (error) {
                            MessageBox.error(
                                "Rejection failed: " +
                                error.message
                            );
                        } finally {
                            view.setBusy(false);
                        }
                    }.bind(this)
                }
            );
        },

        // Clear selected timesheet and its entries
        _clearSelection: function () {
            const model = this.getView().getModel("managerModel");

            model.setProperty("/selectedTimesheetID", "");
            model.setProperty("/selectedEmployeeID", "");
            model.setProperty("/selectedTotalHours", 0);
            model.setProperty("/canReview", false);
            model.setProperty("/entries", []);
        }

    });
});