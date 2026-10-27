sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("psaaadmin.controller.Admin", {

        onInit: function () {
            var oAdminModel = new JSONModel({
                employees: 0,
                clients: 0,
                projects: 0
            });

            this.getView().setModel(oAdminModel, "adminModel");

            this._loadDashboardCounts();
        },

        _getCount: async function (sUrl) {
            var oResponse = await fetch(sUrl, {
                headers: {
                    "Accept": "application/json"
                }
            });

            if (!oResponse.ok) {
                throw new Error("Request failed: " + sUrl);
            }

            var oData = await oResponse.json();

            if (oData["@odata.count"] !== undefined) {
                return oData["@odata.count"];
            }

            return Array.isArray(oData.value) ? oData.value.length : 0;
        },

        _loadDashboardCounts: async function () {
            var oModel = this.getView().getModel("adminModel");

            var aRequests = [
                {
                    key: "employees",
                    url: "/odata/v4/employee-srv/Employees?$count=true&$top=0"
                },
                {
                    key: "clients",
                    url: "/odata/v4/client-srv/Clients?$count=true&$top=0"
                },
                {
                    key: "projects",
                    url: "/odata/v4/project-srv/Projects?$count=true&$top=0"
                }
            ];

            var aResults = await Promise.allSettled(
                aRequests.map(function (oRequest) {
                    return this._getCount(oRequest.url);
                }, this)
            );

            aResults.forEach(function (oResult, iIndex) {
                if (oResult.status === "fulfilled") {
                    oModel.setProperty(
                        "/" + aRequests[iIndex].key,
                        oResult.value
                    );
                } else {
                    console.error(
                        "Failed to load " + aRequests[iIndex].key + " count:",
                        oResult.reason
                    );
                }
            });

            if (aResults.some(function (oResult) {
                return oResult.status === "rejected";
            })) {
                MessageToast.show(
                    "Some dashboard counts could not be loaded. Check the service URLs."
                );
            }
        },

        onEmployees: function () {
            this.getOwnerComponent().getRouter().navTo("RouteEmployees");
        },

        onClients: function () {
            this.getOwnerComponent().getRouter().navTo("RouteClients");
        },

        onProjects: function () {
            this.getOwnerComponent().getRouter().navTo("RouteProjects");
        }

    });
});