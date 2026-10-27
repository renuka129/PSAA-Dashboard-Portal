sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("psaahome.controller.Home", {
        onAdmin: function () {
            window.location.assign("/admin/");
        },

        onManager: function () {
            window.location.assign("/manager/");
        },

        onEmployee: function () {
            window.location.assign("/employee/");
        }
    });
});