sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/Select",
    "sap/ui/core/Item",
    "sap/m/Button",
    "sap/m/VBox",
    "sap/m/TextArea"
], function (
    Controller,
    JSONModel,
    MessageToast,
    MessageBox,
    Dialog,
    Label,
    Input,
    Select,
    Item,
    Button,
    VBox,
    TextArea
) {
    "use strict";

    var PROJECTS_URL = "/odata/v4/project-srv/Projects";
    var CLIENTS_URL = "/odata/v4/client-srv/Clients";
    var EMPLOYEES_URL = "/odata/v4/employee-srv/Employees";

    return Controller.extend("psaaadmin.controller.Projects", {

        onInit: function () {
            this._oProjectsModel = new JSONModel({ projects: [] });
            this.getView().setModel(this._oProjectsModel, "projectsModel");
            this._aAllProjects = [];

            this._loadProjects();
        },

_loadProjects: async function () {
    var oModel = this.getView().getModel("projectsModel");

    try {
        var results = await Promise.all([
            fetch("/odata/v4/project-srv/Projects"),
            fetch("/odata/v4/client-srv/Clients"),
            fetch("/odata/v4/employee-srv/Employees")
        ]);

        for (var response of results) {
            if (!response.ok) {
                throw new Error("HTTP " + response.status);
            }
        }

        var projectsData = await results[0].json();
        var clientsData = await results[1].json();
        var employeesData = await results[2].json();

        var clients = clientsData.value || [];
        var employees = employeesData.value || [];

        var projects = (projectsData.value || []).map(function (project) {
            var client = clients.find(function (item) {
                return item.ID === project.client_ID;
            });

            var manager = employees.find(function (item) {
                return item.ID === project.manager_ID;
            });

            project.clientName = client ? client.name : "";
            project.managerName = manager
                ? (manager.fullName || (manager.firstName + " " + manager.lastName))
                : "";

            return project;
        });

        oModel.setProperty("/projects", projects);

    } catch (error) {
        console.error("Error loading projects:", error);
        sap.m.MessageBox.error(
            "Unable to load projects: " + error.message
        );
    }
},

        onRefresh: function () {
            this._loadProjects();
        },

        onSearch: function (oEvent) {
            var query = (
                oEvent.getParameter("newValue") || ""
            ).toLowerCase();

            var filtered = this._aAllProjects.filter(function (project) {
                return [
                    project.code,
                    project.name,
                    project.client && project.client.name
                ].some(function (value) {
                    return String(value || "").toLowerCase().includes(query);
                });
            });

            this._oProjectsModel.setProperty("/projects", filtered);
        },

        onAddProject: function () {
            this._openProjectDialog();
        },

        onEditProject: function (oEvent) {
            var context = oEvent.getSource()
                .getBindingContext("projectsModel");

            if (!context) {
                MessageBox.error("Unable to find the selected project.");
                return;
            }

            this._openProjectDialog(context.getObject());
        },

        _getReferenceData: async function () {
            var responses = await Promise.all([
                fetch(CLIENTS_URL),
                fetch(EMPLOYEES_URL)
            ]);

            for (var i = 0; i < responses.length; i++) {
                if (!responses[i].ok) {
                    throw new Error(
                        "Unable to load client or employee reference data."
                    );
                }
            }

            var data = await Promise.all([
                responses[0].json(),
                responses[1].json()
            ]);

            return {
                clients: data[0].value || [],
                employees: data[1].value || []
            };
        },

        _openProjectDialog: async function (project) {
            var self = this;
            var editing = Boolean(project);
            var fields = {};

            try {
                var references = await this._getReferenceData();

                function addInput(key, label, value) {
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

                function addSelect(key, label, items, selectedKey) {
                    fields[key] = new Select({
                        width: "100%",
                        selectedKey: selectedKey || "",
                        items: items
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

                var clientItems = references.clients.map(function (client) {
                    return new Item({
                        key: client.ID,
                        text: client.name
                    });
                });

                var managerItems = [
                    new Item({ key: "", text: "No manager assigned" })
                ].concat(
                    references.employees.map(function (employee) {
                        return new Item({
                            key: employee.ID,
                            text: employee.fullName ||
                                (employee.firstName + " " + employee.lastName)
                        });
                    })
                );

                var billingTypes = [
    new Item({ key: "TM", text: "Time and Material" }),
    new Item({ key: "FIXED", text: "Fixed Price" }),
    new Item({ key: "RETAINER", text: "Retainer" })
];

                var statuses = [
    new Item({ key: "PLANNED", text: "Planned" }),
    new Item({ key: "IN_PROGRESS", text: "In Progress" }),
    new Item({ key: "COMPLETED", text: "Completed" }),
    new Item({ key: "ON_HOLD", text: "On Hold" }),
    new Item({ key: "CANCELLED", text: "Cancelled" })
];

                var currencies = [
                    new Item({ key: "INR", text: "INR" }),
                    new Item({ key: "USD", text: "USD" }),
                    new Item({ key: "EUR", text: "EUR" })
                ];

                var selectedClient = project && project.client &&
                    (typeof project.client === "object"
                        ? project.client.ID
                        : project.client);

                var selectedManager = project && project.manager &&
                    (typeof project.manager === "object"
                        ? project.manager.ID
                        : project.manager);

                var content = new VBox({
                    width: "100%",
                    items: [
                        addInput("code", "Project Code *", project && project.code),
                        addInput("name", "Project Name *", project && project.name),
                        addInput("description", "Description", project && project.description),

                        addSelect("client", "Client *", clientItems, selectedClient),

                        addSelect("manager", "Project Manager", managerItems, selectedManager),

                        addSelect(
                            "billingType",
                            "Billing Type *",
                            billingTypes,
                            project && project.billingType
                        ),

                        addSelect(
                            "status",
                            "Status",
                            statuses,
                            project && project.status || "PLANNED"
                        ),

                        addInput("startDate", "Start Date (YYYY-MM-DD)", project && project.startDate),
                        addInput("endDate", "End Date (YYYY-MM-DD)", project && project.endDate),
                        addSelect("currency", "Currency", currencies, project && project.currency || "INR"),
                        addInput("budgetAmount", "Budget Amount", project && project.budgetAmount),
                        addInput("billingRate", "Billing Rate", project && project.billingRate)
                    ]
                });

                var dialog = new Dialog({
                    title: editing ? "Edit Project" : "Add Project",
                    contentWidth: "35rem",
                    content: [content],

                    beginButton: new Button({
                        text: "Save",
                        type: "Emphasized",

                        press: async function () {
                            var code = fields.code.getValue().trim();
                            var name = fields.name.getValue().trim();
                            var clientID = fields.client.getSelectedKey();
                            var billingType = fields.billingType.getSelectedKey();

                            if (!code || !name || !clientID || !billingType) {
                                MessageBox.warning(
                                    "Project Code, Project Name, Client and Billing Type are required."
                                );
                                return;
                            }

                            var budget = fields.budgetAmount.getValue().trim();
                            var rate = fields.billingRate.getValue().trim();

                            if (
                                (budget && !Number.isFinite(Number(budget))) ||
                                (rate && !Number.isFinite(Number(rate)))
                            ) {
                                MessageBox.warning(
                                    "Budget and billing rate must be valid numbers."
                                );
                                return;
                            }

                            var payload = {
                                code: code,
                                name: name,
                                description: fields.description.getValue().trim() || null,
                                client_ID: clientID,
                                manager_ID: fields.manager.getSelectedKey() || null,
                                billingType: billingType,
                                status: fields.status.getSelectedKey(),
                                startDate: fields.startDate.getValue().trim() || null,
                                endDate: fields.endDate.getValue().trim() || null,
                                currency: fields.currency.getSelectedKey() || "INR",
                                budgetAmount: budget ? Number(budget) : 0,
                                billingRate: rate ? Number(rate) : 0
                            };

                            if (
                                (payload.startDate &&
                                    !/^\d{4}-\d{2}-\d{2}$/.test(payload.startDate)) ||
                                (payload.endDate &&
                                    !/^\d{4}-\d{2}-\d{2}$/.test(payload.endDate))
                            ) {
                                MessageBox.warning(
                                    "Enter dates in YYYY-MM-DD format."
                                );
                                return;
                            }

                            try {
                                var url = editing
                                    ? PROJECTS_URL + "(" +
                                        encodeURIComponent(project.ID) + ")"
                                    : PROJECTS_URL;

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
                                        ? "Project updated successfully"
                                        : "Project created successfully"
                                );

                                dialog.close();
                                await self._loadProjects();
                            } catch (error) {
                                console.error("Project save failed:", error);
                                MessageBox.error(
                                    "Unable to save project: " + error.message
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
            } catch (error) {
                console.error("Project form initialization failed:", error);
                MessageBox.error(
                    "Unable to open the project form. Check the client and employee services."
                );
            }
        },

        onDeleteProject: function (oEvent) {
            var self = this;
            var context = oEvent.getSource()
                .getBindingContext("projectsModel");

            if (!context) {
                MessageBox.error("Unable to find the selected project.");
                return;
            }

            var project = context.getObject();

            MessageBox.confirm(
                "Delete project '" + project.name + "'?",
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
                                PROJECTS_URL + "(" +
                                    encodeURIComponent(project.ID) + ")",
                                { method: "DELETE" }
                            );

                            if (!response.ok) {
                                throw new Error(await response.text());
                            }

                            MessageToast.show("Project deleted successfully");
                            await self._loadProjects();
                        } catch (error) {
                            console.error("Project deletion failed:", error);
                            MessageBox.error(
                                "Unable to delete project. It may have related records.\n" +
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