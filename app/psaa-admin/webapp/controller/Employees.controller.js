sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/Button",
    "sap/m/VBox"
], function (
    Controller,
    JSONModel,
    MessageToast,
    MessageBox,
    Dialog,
    Label,
    Input,
    Button,
    VBox
) {
    "use strict";

    var EMPLOYEES_URL = "/odata/v4/employee-srv/Employees";

    return Controller.extend("psaaadmin.controller.Employees", {

        onInit: function () {
            this._oEmployeesModel = new JSONModel({ employees: [] });
            this.getView().setModel(this._oEmployeesModel, "employeesModel");
            this._aAllEmployees = [];

            this._loadEmployees();
        },

        _loadEmployees: async function () {
            try {
                var response = await fetch(EMPLOYEES_URL);

                if (!response.ok) {
                    throw new Error(await response.text());
                }

                var data = await response.json();

                this._aAllEmployees = data.value || [];
                this._oEmployeesModel.setProperty(
                    "/employees",
                    this._aAllEmployees
                );
            } catch (error) {
                console.error("Employee loading failed:", error);

                MessageBox.error(
                    "Unable to load employees. Check the EmployeeSrv endpoint."
                );
            }
        },

        onRefresh: function () {
            this._loadEmployees();
        },

        onSearch: function (oEvent) {
            var query = (oEvent.getParameter("newValue") || "").toLowerCase();

            var filtered = this._aAllEmployees.filter(function (employee) {
                return [
                    employee.employeeNo,
                    employee.fullName,
                    employee.firstName,
                    employee.lastName,
                    employee.email,
                    employee.designation,
                    employee.department
                ].some(function (value) {
                    return String(value || "").toLowerCase().includes(query);
                });
            });

            this._oEmployeesModel.setProperty("/employees", filtered);
        },

        onAddEmployee: function () {
            this._openEmployeeDialog();
        },

        onEditEmployee: function (oEvent) {
            var context = oEvent.getSource()
                .getBindingContext("employeesModel");

            if (!context) {
                MessageBox.error("Unable to find the selected employee.");
                return;
            }

            this._openEmployeeDialog(context.getObject());
        },

        _openEmployeeDialog: function (employee) {
            var self = this;
            var editing = Boolean(employee);
            var fields = {};

            function addField(key, label, value) {
                fields[key] = new Input({
                    value: value || "",
                    width: "100%"
                });

                return new VBox({
                    items: [
                        new Label({
                            text: label,
                            labelFor: fields[key]
                        }),
                        fields[key]
                    ]
                }).addStyleClass("sapUiSmallMarginBottom");
            }

            var dialog = new Dialog({
                title: editing ? "Edit Employee" : "Add Employee",
                contentWidth: "32rem",
                content: [
                    new VBox({
                        width: "100%",
                        items: [
                            addField("employeeNo", "Employee Number *",
                                employee && employee.employeeNo),
                            addField("firstName", "First Name *",
                                employee && employee.firstName),
                            addField("lastName", "Last Name *",
                                employee && employee.lastName),
                            addField("email", "Email *",
                                employee && employee.email),
                            addField("phone", "Phone",
                                employee && employee.phone),
                            addField("designation", "Designation",
                                employee && employee.designation),
                            addField("department", "Department",
                                employee && employee.department),
                            addField("status", "Status",
                                employee && employee.status || "Active")
                        ]
                    })
                ],

                beginButton: new Button({
                    text: "Save",
                    type: "Emphasized",

                    press: async function () {
                        var employeeNo = fields.employeeNo.getValue().trim();
                        var firstName = fields.firstName.getValue().trim();
                        var lastName = fields.lastName.getValue().trim();
                        var email = fields.email.getValue().trim();

                        if (!employeeNo || !firstName || !lastName || !email) {
                            MessageBox.warning(
                                "Employee Number, First Name, Last Name and Email are required."
                            );
                            return;
                        }

                        var payload = {
                            employeeNo: employeeNo,
                            firstName: firstName,
                            lastName: lastName,
                            fullName: (firstName + " " + lastName).trim(),
                            email: email,
                            phone: fields.phone.getValue().trim() || null,
                            designation: fields.designation.getValue().trim() || null,
                            department: fields.department.getValue().trim() || null,
                            status: fields.status.getValue().trim() || "Active"
                        };

                        try {
                            var url = editing
                                ? EMPLOYEES_URL + "(" +
                                    encodeURIComponent(employee.ID) + ")"
                                : EMPLOYEES_URL;

                            var response = await fetch(url, {
                                method: editing ? "PATCH" : "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "Accept": "application/json"
                                },
                                body: JSON.stringify(payload)
                            });

                            if (!response.ok) {
                                throw new Error(await response.text());
                            }

                            MessageToast.show(
                                editing
                                    ? "Employee updated successfully"
                                    : "Employee created successfully"
                            );

                            dialog.close();
                            await self._loadEmployees();

                        } catch (error) {
                            console.error("Employee save failed:", error);

                            MessageBox.error(
                                "Unable to save employee: " + error.message
                            );
                        }
                    }
                }),

                endButton: new Button({
                    text: "Cancel",
                    press: function () {
                        dialog.close();
                    }
                }),

                afterClose: function () {
                    dialog.destroy();
                }
            });

            dialog.open();
        },

        onDeleteEmployee: function (oEvent) {
            var self = this;
            var context = oEvent.getSource()
                .getBindingContext("employeesModel");

            if (!context) {
                MessageBox.error("Unable to find the selected employee.");
                return;
            }

            var employee = context.getObject();

            MessageBox.confirm(
                "Delete employee '" +
                    (employee.fullName || employee.employeeNo) + "'?",
                {
                    title: "Confirm Delete",
                    actions: [
                        MessageBox.Action.DELETE,
                        MessageBox.Action.CANCEL
                    ],
                    emphasizedAction: MessageBox.Action.DELETE,

                    onClose: async function (action) {
                        if (action !== MessageBox.Action.DELETE) {
                            return;
                        }

                        try {
                            var response = await fetch(
                                EMPLOYEES_URL + "(" +
                                    encodeURIComponent(employee.ID) + ")",
                                { method: "DELETE" }
                            );

                            if (!response.ok) {
                                throw new Error(await response.text());
                            }

                            MessageToast.show("Employee deleted successfully");
                            await self._loadEmployees();

                        } catch (error) {
                            console.error("Employee deletion failed:", error);

                            MessageBox.error(
                                "Unable to delete employee. The employee may be referenced by other records.\n" +
                                error.message
                            );
                        }
                    }
                }
            );
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteAdmin");
        }

    });
});