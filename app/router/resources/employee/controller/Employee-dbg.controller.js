sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    const API = {
        employees: "/odata/v4/employee-srv/Employees",
        projects: "/odata/v4/project-srv/Projects",
        tasks: "/odata/v4/task-srv/Tasks",
        timesheets: "/odata/v4/timesheet-srv/Timesheets",
        entries: "/odata/v4/timesheet-srv/TimesheetEntries",
        submit: "/odata/v4/timesheet-srv/submitTimesheet"
    };

    return Controller.extend("psaaemployee.controller.Employee", {

        onInit: function () {
            const view = this.getView();

            view.setModel(new JSONModel({
                employees: []
            }), "employeeModel");

            view.setModel(new JSONModel({
                projects: []
            }), "projectModel");

            view.setModel(new JSONModel({
                tasks: []
            }), "taskModel");

            view.setModel(new JSONModel({
                timesheets: [],
                selectedTimesheetID: "",
                selectedTimesheetStatus: "",
                entries: [],
                totalHours: 0
            }), "timesheetModel");

            view.setModel(new JSONModel({
                projectCount: 0,
                taskCount: 0,
                timesheetCount: 0
            }), "dashboardModel");

            this._loadInitialData();
        },

        _request: async function (url, options = {}) {
            const requestOptions = {
                credentials: "same-origin",
                ...options,
                headers: {
                    Accept: "application/json",
                    ...(options.body
                        ? { "Content-Type": "application/json" }
                        : {}),
                    ...(options.headers || {})
                }
            };

            const response = await fetch(url, requestOptions);
            const responseText = await response.text();

            let data = {};

            try {
                data = responseText
                    ? JSON.parse(responseText)
                    : {};
            } catch (error) {
                data = {
                    message: responseText
                };
            }

            if (!response.ok) {
                throw new Error(
                    data.error?.message ||
                    data.message ||
                    `Request failed with status ${response.status}`
                );
            }

            return data;
        },

        _loadInitialData: async function () {
            const view = this.getView();

            view.setBusy(true);

            try {
                const [
                    employeeResult,
                    projectResult,
                    taskResult
                ] = await Promise.all([
                    this._request(API.employees),
                    this._request(API.projects),
                    this._request(API.tasks)
                ]);

                const employees = (employeeResult.value || []).map(
                    function (employee) {
                        return {
                            ...employee,
                            fullName: employee.fullName ||
                                [
                                    employee.firstName,
                                    employee.lastName
                                ].filter(Boolean).join(" ") ||
                                employee.employeeNo ||
                                employee.ID
                        };
                    }
                );

                view.getModel("employeeModel")
                    .setProperty("/employees", employees);

                view.getModel("projectModel")
                    .setProperty("/projects", projectResult.value || []);

                view.getModel("taskModel")
                    .setProperty("/tasks", taskResult.value || []);

                this._setDefaultWeekStart();

                if (employees.length > 0) {
                    view.byId("employeeSelect")
                        .setSelectedKey(employees[0].ID);

                    await this._loadEmployeeTimesheets(employees[0].ID);
                } else {
                    await this._loadEmployeeTimesheets(null);
                }

                this._setDashboardCounts();

            } catch (error) {
                MessageBox.error(
                    "Unable to load employee dashboard: " + error.message
                );
            } finally {
                view.setBusy(false);
            }
        },

        _loadEmployeeTimesheets: async function (employeeID) {
            const view = this.getView();
            const model = view.getModel("timesheetModel");

            // Clear previous employee selection and entries.
            model.setProperty("/selectedTimesheetID", "");
            model.setProperty("/selectedTimesheetStatus", "");
            model.setProperty("/entries", []);
            model.setProperty("/totalHours", 0);

            if (!employeeID) {
                model.setProperty("/timesheets", []);
                this._setDashboardCounts();
                return;
            }

            const filter = encodeURIComponent(
                `employee_ID eq ${employeeID}`
            );

            const result = await this._request(
                `${API.timesheets}?$filter=${filter}&$orderby=weekStart desc`
            );

            const projects = view.getModel("projectModel")
                .getProperty("/projects") || [];

            const projectMap = new Map(
                projects.map(function (project) {
                    return [project.ID, project.name];
                })
            );

            const timesheets = (result.value || []).map(
                function (timesheet) {
                    const status = String(timesheet.status || "")
                        .trim()
                        .toUpperCase();

                    const canSubmit = [
                        "DRAFT",
                        "REJECTED"
                    ].includes(status);

                    let statusState = "None";

                    if (status === "APPROVED" || status === "INVOICED") {
                        statusState = "Success";
                    } else if (status === "SUBMITTED") {
                        statusState = "Information";
                    } else if (status === "REJECTED") {
                        statusState = "Error";
                    } else if (status === "DRAFT") {
                        statusState = "Warning";
                    }

                    return {
                        ...timesheet,

                        status: status,

                        weekStart: String(
                            timesheet.weekStart || ""
                        ).slice(0, 10),

                        weekEnd: String(
                            timesheet.weekEnd || ""
                        ).slice(0, 10),

                        projectName:
                            projectMap.get(timesheet.project_ID) ||
                            timesheet.project_ID,

                        canSubmit: canSubmit,

                        statusState: statusState,

                        totalHours: Number(timesheet.totalHours || 0)
                    };
                }
            );

            model.setProperty("/timesheets", timesheets);

            this._setDashboardCounts();
        },

        _setDashboardCounts: function () {
            const view = this.getView();

            const projects = view.getModel("projectModel")
                .getProperty("/projects") || [];

            const tasks = view.getModel("taskModel")
                .getProperty("/tasks") || [];

            const timesheets = view.getModel("timesheetModel")
                .getProperty("/timesheets") || [];

            view.getModel("dashboardModel").setData({
                projectCount: projects.length,
                taskCount: tasks.length,
                timesheetCount: timesheets.length
            });
        },

        _setDefaultWeekStart: function () {
            const date = new Date();

            const daysSinceMonday = (date.getDay() + 6) % 7;

            date.setDate(date.getDate() - daysSinceMonday);

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");

            this.getView()
                .byId("weekStartPicker")
                .setValue(`${year}-${month}-${day}`);
        },

        onEmployeeChange: async function (event) {
            const employeeID = event.getSource().getSelectedKey();
            const view = this.getView();

            // Clear any previously selected row.
            view.byId("timesheetsTable").removeSelections(true);

            view.setBusy(true);

            try {
                await this._loadEmployeeTimesheets(employeeID);
            } catch (error) {
                MessageBox.error(
                    "Unable to load timesheets: " + error.message
                );
            } finally {
                view.setBusy(false);
            }
        },

        onRefresh: async function () {
            await this._loadInitialData();
            MessageToast.show("Dashboard refreshed.");
        },

        onCreateTimesheet: async function () {
            const view = this.getView();

            const employeeID = view.byId("employeeSelect")
                .getSelectedKey();

            const projectID = view.byId("timesheetProjectSelect")
                .getSelectedKey();

            const weekStart = view.byId("weekStartPicker").getValue();

            if (!employeeID || !projectID || !weekStart) {
                MessageBox.warning(
                    "Select an employee, project, and week start date."
                );
                return;
            }

            const parsedDate = new Date(`${weekStart}T00:00:00`);

            if (
                Number.isNaN(parsedDate.getTime()) ||
                parsedDate.getDay() !== 1
            ) {
                MessageBox.warning(
                    "The week start date must be a Monday."
                );
                return;
            }

            const sunday = new Date(parsedDate);
            sunday.setDate(sunday.getDate() + 6);

            const weekEnd = [
                sunday.getFullYear(),
                String(sunday.getMonth() + 1).padStart(2, "0"),
                String(sunday.getDate()).padStart(2, "0")
            ].join("-");

            view.setBusy(true);

            try {
                await this._request(API.timesheets, {
                    method: "POST",
                    body: JSON.stringify({
                        employee_ID: employeeID,
                        project_ID: projectID,
                        weekStart: weekStart,
                        weekEnd: weekEnd
                    })
                });

                await this._loadEmployeeTimesheets(employeeID);

                MessageToast.show(
                    "Timesheet created successfully."
                );

            } catch (error) {
                MessageBox.error(
                    "Could not create timesheet: " + error.message
                );
            } finally {
                view.setBusy(false);
            }
        },

        onTimesheetRowSelection: async function (event) {
            const selectedItem = event.getParameter("listItem");

            if (!selectedItem) {
                return;
            }

            const context = selectedItem.getBindingContext("timesheetModel");
            const timesheet = context && context.getObject();

            if (!timesheet || !timesheet.ID) {
                return;
            }

            const model = this.getView().getModel("timesheetModel");

            model.setProperty("/selectedTimesheetID", timesheet.ID);
            model.setProperty(
                "/selectedTimesheetStatus",
                timesheet.status
            );

            await this._loadEntries(timesheet.ID);
        },

        _loadEntries: async function (timesheetID) {
            const model = this.getView().getModel("timesheetModel");

            if (!timesheetID) {
                model.setProperty("/entries", []);
                model.setProperty("/totalHours", 0);
                return;
            }

            try {
                const filter = encodeURIComponent(
                    `timesheet_ID eq ${timesheetID}`
                );

                const result = await this._request(
                    `${API.entries}?$filter=${filter}&$orderby=workDate`
                );

                const entries = result.value || [];

                model.setProperty("/entries", entries);

                const totalHours = entries.reduce(
                    function (total, entry) {
                        return total + Number(entry.hours || 0);
                    },
                    0
                );

                model.setProperty(
                    "/totalHours",
                    Number(totalHours.toFixed(2))
                );

            } catch (error) {
                MessageBox.error(
                    "Unable to load entries: " + error.message
                );
            }
        },

        onAddTimesheetEntry: async function () {
            const view = this.getView();
            const model = view.getModel("timesheetModel");

            const timesheetID = model.getProperty(
                "/selectedTimesheetID"
            );

            const timesheetStatus = String(
                model.getProperty("/selectedTimesheetStatus") || ""
            ).toUpperCase();

            if (!timesheetID) {
                MessageBox.warning(
                    "Select a timesheet first."
                );
                return;
            }

            if (!["DRAFT", "REJECTED"].includes(timesheetStatus)) {
                MessageBox.warning(
                    "Only draft or rejected timesheets can be edited."
                );
                return;
            }

            const taskID = view.byId("entryTaskSelect")
                .getSelectedKey();

            const workDate = view.byId("entryWorkDatePicker")
                .getValue();

            const hours = Number(
                view.byId("entryHoursInput").getValue()
            );

            const billable = view.byId("entryBillableSwitch")
                .getState();

            const notes = view.byId("entryNotesInput").getValue();

            if (
                !taskID ||
                !workDate ||
                !Number.isFinite(hours) ||
                hours < 0.25 ||
                hours > 24 ||
                Math.round(hours * 4) !== hours * 4
            ) {
                MessageBox.warning(
                    "Select a task and date. Hours must be between 0.25 and 24 in 0.25-hour increments."
                );
                return;
            }

            const selectedTimesheet = (
                model.getProperty("/timesheets") || []
            ).find(function (item) {
                return item.ID === timesheetID;
            });

            if (!selectedTimesheet) {
                MessageBox.error(
                    "Timesheet details could not be found. Refresh and try again."
                );
                return;
            }

            if (
                workDate < selectedTimesheet.weekStart ||
                workDate > selectedTimesheet.weekEnd
            ) {
                MessageBox.warning(
                    "The work date must fall within the selected timesheet week."
                );
                return;
            }

            const tasks = view.getModel("taskModel")
                .getProperty("/tasks") || [];

            const task = tasks.find(function (item) {
                return item.ID === taskID;
            });

            if (
                !task ||
                task.project_ID !== selectedTimesheet.project_ID
            ) {
                MessageBox.warning(
                    "Select a task belonging to the timesheet's project."
                );
                return;
            }

            view.setBusy(true);

            try {
                await this._request(API.entries, {
                    method: "POST",
                    body: JSON.stringify({
                        timesheet_ID: timesheetID,
                        task_ID: taskID,
                        workDate: workDate,
                        hours: hours,
                        billable: billable,
                        notes: notes
                    })
                });

                await this._loadEntries(timesheetID);

                // Refresh timesheet totals if the service exposes them.
                await this._loadEmployeeTimesheets(
                    view.byId("employeeSelect").getSelectedKey()
                );

                // Restore the selected timesheet after refreshing.
                model.setProperty("/selectedTimesheetID", timesheetID);
                model.setProperty(
                    "/selectedTimesheetStatus",
                    selectedTimesheet.status
                );

                view.byId("entryHoursInput").setValue("");
                view.byId("entryNotesInput").setValue("");

                MessageToast.show("Timesheet entry added.");

            } catch (error) {
                MessageBox.error(
                    "Could not add entry: " + error.message
                );
            } finally {
                view.setBusy(false);
            }
        },

        onSubmitTimesheet: function (event) {
            const context = event.getSource()
                .getBindingContext("timesheetModel");

            const timesheet = context && context.getObject();

            if (!timesheet || !timesheet.ID) {
                MessageBox.error(
                    "Could not identify the selected timesheet."
                );
                return;
            }

            const status = String(timesheet.status || "")
                .trim()
                .toUpperCase();

            if (!["DRAFT", "REJECTED"].includes(status)) {
                MessageBox.warning(
                    "Only draft or rejected timesheets can be submitted."
                );
                return;
            }

            MessageBox.confirm(
                "Submit this timesheet for manager approval?",
                {
                    title: "Submit Timesheet",

                    onClose: async function (action) {
                        if (action !== MessageBox.Action.OK) {
                            return;
                        }

                        const view = this.getView();

                        view.setBusy(true);

                        try {
                            await this._request(API.submit, {
                                method: "POST",
                                body: JSON.stringify({
                                    timesheetID: timesheet.ID
                                })
                            });

                            // Reload from the backend to get the real status.
                            await this._loadEmployeeTimesheets(
                                view.byId("employeeSelect").getSelectedKey()
                            );

                            // Clear selection and entries after submission.
                            view.byId("timesheetsTable")
                                .removeSelections(true);

                            const model = view.getModel("timesheetModel");

                            model.setProperty("/selectedTimesheetID", "");
                            model.setProperty("/selectedTimesheetStatus", "");
                            model.setProperty("/entries", []);
                            model.setProperty("/totalHours", 0);

                            MessageToast.show(
                                "Timesheet submitted for approval."
                            );

                        } catch (error) {
                            MessageBox.error(
                                "Submission failed: " + error.message
                            );
                        } finally {
                            view.setBusy(false);
                        }
                    }.bind(this)
                }
            );
        }

    });
});