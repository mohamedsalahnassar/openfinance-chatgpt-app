import { createRouter, createWebHistory } from "vue-router";
import PageWrapper from "../layouts/PageWrapper.vue";

import ConsentSetup from "../views/ConsentSetup.vue"
import RedirectScreen from "../views/RedirectScreen.vue"

// BDSP
import DataPermissions from "../views/DataPermissions.vue"
import DataRequests from "../views/DataRequests.vue"

// SIP
import SIPpermissions from "../views/SIPPermissions.vue"
import SIPRequest from "../views/SIPRequest.vue"

// Multi Payments
import VRPPermissions from "../views/VRPPermissions.vue"
import VRPRequests from "../views/VRPRequests.vue"


import OpenProductRequests from "../views/OpenProductRequests.vue"

// Callback
import CallBack from "../views/CallBack.vue"
import Success from "../views/DataSuccess.vue"
import VRPSuccess from "../views/VRPSuccess.vue"
import SIPSuccess from "../views/SIPSuccess.vue"


import Failed from "../views/Failed.vue"

import NotFound from "../views/NotFound.vue"

const routes = [
  {
    path: "",
    component: PageWrapper,
    children: [

      {
        path: "/client",
        name: "consent-setup",
        component: ConsentSetup,
      },

      
      {
        path: "/client/data-permissions",
        name: "data-permissions",
        component: DataPermissions,
      },

      {
        path: "/client/sip-permissions",
        name: "sip-permissions",
        component: SIPpermissions,
      },

      {
        path: "/client/vrp-permissions",
        name: "vrp-permissions",
        component: VRPPermissions,
      },

      {
        path: "/client/callback",
        name: "callback",
        component: CallBack,  
      },

      {
        path: "/client/data-success",
        name: "data-success",
        component: Success,  
      },

      {
        path: "/client/vrp-success",
        name: "vrp-success",
        component: VRPSuccess,  
      },

      {
        path: "/client/sip-success",
        name: "sip-success",
        component: SIPSuccess,
      },

      {
        path: "/client/failed",
        name: "failed",
        component: Failed,  
      },



      {
        path: "/client/data-requests",
        name: "data-requests",
        component: DataRequests,  
      },

      {
        path: "/client/sip-request",
        name: "sip-request",
        component: SIPRequest  
      },

      {
        path: "/client/vrp-requests",
        name: "vrp-requests",
        component: VRPRequests  
      },


      {
        path: "/client/open-product-requests",
        name: "open-product-requests",
        component: OpenProductRequests,  
      },

      {
        path: "/:catchAll(.*)",
        name: "not-found",
        component: NotFound
      },
    ],
  },
  {
    path: "/client/redirect-screen",
    name: "redirect-screen",
    component: RedirectScreen,
  },
];

const router = createRouter({
  scrollBehavior(to, from, savedPosition) {
    // always scroll to top
    return { top: 0 }
  },
  history: createWebHistory(),
  routes,
});
export default router;
