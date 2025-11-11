<template>
  <div>
    <Title> TPP App </Title>

    <div class="text-xl flex">
    Amount: <img src="../assets/dd-black.svg" alt="Digital Dirham"  class="ml-2 mr-1" style="height: 1em; vertical-align: middle;" /> 123.45
    </div>
    
    <div class="pt-6">
      <InputDropDown :error="complete && !bank" @output="setBank" placeholder="Select your bank" />
      <div class="min-h-6">
        <div v-if="complete && !bank" class="error">
          <div class="error-text">Field is required.</div>
        </div>
      </div>


      <div class="flex flex-wrap mb-1">
        <div @click="setTppType('BDS')" :class="tppTypeClass('BDS')">
          <div class="relative left-1/2 transform -translate-x-1/2">Bank Data</div>
        </div>
        <div @click="setTppType('SIP')" :class="tppTypeClass('SIP')">
          <div class="relative left-1/2 transform -translate-x-1/2">Bank Service (SIP)</div>
        </div>
        <div @click="setTppType('VRP')" :class="tppTypeClass('VRP')">
          <div class="relative left-1/2 transform -translate-x-1/2">Bank Service (VRP)</div>
        </div>
        <div @click="setTppType('OD')" :class="tppTypeClass('OD')">
          <div class="relative left-1/2 transform -translate-x-1/2">Open Data</div>
        </div>
      </div>
      <div class="min-h-6 mb-2">
        <div v-if="!this.tppType && this.complete
        " class="error">
          <div class="error-text">Field is required.</div>
        </div>
      </div>

      <div v-if="tppType === 'BDS'">
        <div class="flex flex-wrap mb-1">
          <div @click="togglePermission('balances')" :class="permissionClass('balances')">
            <div class="relative left-1/2 transform -translate-x-1/2">Balances</div>
          </div>
          <div @click="togglePermission('transactions')" :class="permissionClass('transactions')">
            <div class="relative left-1/2 transform -translate-x-1/2">Transactions</div>
          </div>
          <div @click="togglePermission('direct-debits')" :class="permissionClass('direct-debits')">
            <div class="relative left-1/2 transform -translate-x-1/2">Direct Debits</div>
          </div>
          <div @click="togglePermission('beneficiaries')" :class="permissionClass('beneficiaries')">
            <div class="relative left-1/2 transform -translate-x-1/2">Beneficiaries</div>
          </div>
          <div @click="togglePermission('scheduled-payments')" :class="permissionClass('scheduled-payments')">
            <div class="relative left-1/2 transform -translate-x-1/2">Scheduled Payments</div>
          </div>
          <div @click="togglePermission('standing-orders')" :class="permissionClass('standing-orders')">
            <div class="relative left-1/2 transform -translate-x-1/2">Standing Orders</div>
          </div>
          <div @click="togglePermission('product')" :class="permissionClass('product')">
            <div class="relative left-1/2 transform -translate-x-1/2">Product</div>
          </div>
          <div @click="togglePermission('parties')" :class="permissionClass('parties')">
            <div class="relative left-1/2 transform -translate-x-1/2">Parties</div>
          </div>
        </div>
        <div class="min-h-6 mb-4">
          <div v-if="this.dataPermissions.length === 0 && this.complete
          " class="error">
            <div class="error-text">One permission must be set.</div>
          </div>
        </div>
      </div>



      <div v-if="tppType === 'SIP'">
        <InputCurrency :input="paymentAmount"
          :error="(complete && !paymentAmount) || (paymentAmount && paymentAmount <= 0)" @output="setPaymentAmount"
          placeholder="Enter payment amount" />
        <div class="min-h-6">
          <div v-if="complete && !paymentAmount" class="error">
            <div class="error-text">Field is required.</div>
          </div>
          <div v-if="paymentAmount && paymentAmount <= 0" class="error">
            <div class="error-text">Payment amount must be greater than 0</div>
          </div>
        </div>

      </div>

      <div v-if="tppType === 'VRP'">
        <InputCurrency :input="maxVRPAmount" :error="(complete && !maxVRPAmount) || (maxVRPAmount && maxVRPAmount <= 0)"
          @output="setVRPAmount" placeholder="Enter maximum individual payment amount" />
        <div class="min-h-6">
          <div v-if="complete && !maxVRPAmount" class="error">
            <div class="error-text">Field is required.</div>
          </div>
          <div v-if="maxVRPAmount && maxVRPAmount <= 0" class="error">
            <div class="error-text">Payment amount must be greater than 0</div>
          </div>
        </div>
      </div>


      <!-- Confirmation of Payee:
        <div class="flex flex-wrap mb-1">
        <div @click="setconfirmationOfPayee(true)" :class="copClass(true)">
          <div class="relative left-1/2 transform -translate-x-1/2">Yes</div>
        </div>
        <div @click="setconfirmationOfPayee(false)" :class="copClass(false)">
          <div class="relative left-1/2 transform -translate-x-1/2">No</div>
        </div>
      </div>
        <div class="min-h-6 mb-4">
        <div v-if="!this.confirmationOfPayee && this.complete
        " class="error">
          <div class="error-text">Field is required.</div>
        </div>
      </div> -->


    </div>

    <div @click="redirectToBank" class="mt-auto button !w-full pt-8">
      <img class="w-6 ml-auto mr-4" src="../assets/AlWLogo.svg" />
      <span class="mr-auto">Proceed to AlTareq</span>
    </div>
  </div>
</template>


<script>
import { useVuelidate } from '@vuelidate/core'
import Input from "../components/Input.vue"
import InputDropDown from "../components/InputDropDown.vue"
import Title from "../components/Title.vue"
import InputCurrency from "../components/InputCurrency.vue"


import crypto from 'crypto-js'

import api from '../api';

export default {
  setup() {
    return { v$: useVuelidate() }

  },

  components: {
    Title: Title,
    Input: Input,
    InputCurrency: InputCurrency,
    InputDropDown: InputDropDown,

  },

  data() {
    return {
      dataShown: undefined,

      revealRate: false,
      rateRevealed: false,
      complete: false,
      decryptionKey: undefined,
      decryptedRate: undefined,
      encrypted: undefined,

      bank: undefined,

      tppType: undefined,

      paymentAmount: undefined,
      maxVRPAmount: undefined,
      dataPermissions: [
        'balances',
        'transactions',
        'direct-debits',
        'beneficiaries',
        'scheduled-payments',
        'standing-orders',
        'product',
        'parties'
      ],
      confirmationOfPayee: undefined,

      complete: false
    };
  },
  created() {
    this.$store.commit("clear_accountsData");
  },
  methods: {
    tppTypeClass(val) {
      if (!this.tppType && this.complete) return "button-third !border-error !shadow-error w-56"
      if (this.tppType === val) return "button-third bg-base-20 w-56"
      return "button-third w-56"
    },
    permissionClass(val) {
      if (this.dataPermissions.length === 0 && this.complete) return "button-third !text-sm !border-error !shadow-error w-48"
      if (this.dataPermissions.indexOf(val) > -1) return "button-third !text-sm bg-base-20 w-48"
      return "button-third !text-sm w-48"
    },
    copClass(val) {
      if (!this.confirmationOfPayee && this.complete) return "button-third !border-error !shadow-error w-56"
      if (this.confirmationOfPayee === val) return "button-third bg-base-20 w-56"
      return "button-third w-56"
    },
    setTppType(val) {
      this.tppType = val;
    },
    setconfirmationOfPayee(val) {
      this.confirmationOfPayee = val
    },
    togglePermission(val) {
      const index = this.dataPermissions.indexOf(val);
      if (index === -1) {
        // 'transaction' not in array, add it
        this.dataPermissions.push(val);
      } else {
        // 'transaction' exists, remove it
        this.dataPermissions.splice(index, 1);
      }
      return arr;
    },

    setBank(val) {
      this.bank = val.data
    },

    setPaymentAmount(val) {
      this.paymentAmount = val.data
    },

    setVRPAmount(val) {
      this.maxVRPAmount = val.data
    },

    async submit() {
      this.dataShown = crypto.AES.encrypt('27.9%', '1234').toString()
      this.$store.dispatch("getProductData");
    },

    async redirectToBank() {
      this.complete = true;

      let endpoint;

      let config = {}

      if (this.bank && this.tppType) {

        console.log(this.tppType)

        if (this.tppType === 'OD') {
          this.$router.push('open-data')
          return;
        }
        else if (this.tppType === 'BDS') {
          endpoint = `/bank-data-authentication`
          config = {
            method: 'post',
            url: endpoint,
            data: {
              data_permissions: this.dataPermissions
            }
          }
        } else if (this.tppType === 'SIP' && (!this.paymentAmount || this.paymentAmount <= 0)) {
          return;
        }
        else if (this.tppType === 'SIP') {
          endpoint = `/payments-authentication`
          config = {
            method: 'post',
            url: endpoint,
            data: {
              payment_amount: this.paymentAmount
            }
          }
        } else if (this.tppType === 'VRP' && (!this.maxVRPAmount || this.maxVRPAmount <= 0)) {
          return;
        }
        else if (this.tppType === 'VRP') {
          endpoint = `/vrp-authentication`
          config = {
            method: 'post',
            url: endpoint,
            data: {
              maximum_individual_payment_amount: this.maxVRPAmount
            }
          }
        }

        console.log(config)
        const response = await api.request(config)
        window.location.href = response.data.redirect
      }
    }
  }
}

</script>
