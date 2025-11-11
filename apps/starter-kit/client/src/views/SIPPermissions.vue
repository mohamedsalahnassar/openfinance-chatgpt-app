<template>
  <div class="text-section">
    <h1 class="text-section-title">
      Permission for Payment
    </h1>
    <p>
      We need you permssion to securely take the following payment on your behalf.
    </p>
    <br/>
    <div style="display: flex; opacity: 80%;">
      <span style="margin-right: auto;">Reference</span>  <span>MY REFERENCE</span>
    </div>
    <br/>
    <h3 class="text-section-title">
      Payee Details
    </h3>
    <div style="display: flex; opacity: 80%;">
      <span style="margin-right: auto;">Account Number</span>  <span>10000109010101</span>
    </div>
    <div style="display: flex; opacity: 80%;">
      <span style="margin-right: auto;">Payee Name</span>  <span>Mario International</span>
    </div>
    <br/>
    <h3 class="text-section-title">
      Payment Amount
    </h3>
    <InputCurrency placeholder="Payment amount" @output="setPA" />




    <br />
  </div>
  <AlTareqButton @click="submit" />
  <div class="primary-button-suptext">
    We will securely transfer you to <strong>Model Bank</strong> to authorize and make the payment.
  </div>
</template>


<script>
import ToggleText from '../components/ToggleText.vue';
import AlTareqButton from '../components/AlTareqButton.vue';
import SelectOptions from '../components/SelectOptions.vue';
import InputCurrency from '../components/InputCurrency.vue';

import api from '../api';

export default {
  components: {
    ToggleText,
    AlTareqButton,
    SelectOptions,
    InputCurrency,
  },
  data() {
    return {
      payment_amount: undefined,
    }
  },
  created() {
    if(!this.bank) {
      this.$router.push({name: 'consent-setup'})
    }
  },
  computed: {
    bank() {
      return this.$route.query.bank
    },
  },
  methods: {
    setPA(val) {
      this.payment_amount = val.data;
    },
    async submit() {
      if(this.payment_amount) {
      this.$router.push({ name: 'redirect-screen' });
      const config = {
        method: 'post',
        url: '/consent-create/single-payment',
        data: {
          payment_amount: this.payment_amount
          }
      }
      const response = await api.request(config)
      window.location.href = response.data.redirect
    }
    }
  }
}
</script>