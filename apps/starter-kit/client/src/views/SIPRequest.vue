<template>
  <div class="text-section">
    <h1 class="text-section-title">
      Payment Initiation
    </h1>
    <p>
      Please test the payment resources below for ModelBank:
    </p>
    <InputCurrency :input="paymentAmount" placeholder="Payment Amount" @output="setPA" />

    <br/>
    <button @click="makePayment" class="thirdButton">
      Make Payment
    </button>

    <!-- <div v-if="paymentIds.length > 0">
      <h1 class="text-section-title">
        Payments
      </h1>
      <div v-for="paymentId in paymentIds">
        {{ paymentId }}
        <button @click="getPayment(paymentId)" class="thirdButton">
          Get Payment
        </button>
      </div>

    </div> -->
  </div>
  <pre v-if="displayedJson" class="code-section">
    <img class="codeCopyIcon" @click="copy" src="../assets/icons/copy.svg" alt="copy" />
    {{ displayedJson }}
  </pre>
</template>


<script>
import api from '../api';
import { decodeJwt } from 'jose';
import InputCurrency from '../components/InputCurrency.vue';


export default {
  components: {
    InputCurrency,
  },
  data() {
    return {
      state: undefined,
      payment_amount: undefined,
      displayedJson: undefined,
      paymentIds: [],
      // jwt: 'eyJhbGciOiJQUzI1NiIsImtpZCI6IkxTUXhZc0thR2RzMk9lZS1pR01jYmVLd3c0SXplNXo4bG10YWhJMDRHLTQifQ.eyJtZXNzYWdlIjp7IkRhdGEiOnsiQXV0aG9yaXphdGlvblNlcnZlclVybCI6Imh0dHBzOi8vYXMxLmFsdGFyZXExLnNhbmRib3guYXBpaHViLm9wZW5maW5hbmNlLmFlIiwiUmVzb3VyY2VTZXJ2ZXJVcmwiOiJodHRwczovL3JzMS5hbHRhcmVxMS5zYW5kYm94LmFwaWh1Yi5vcGVuZmluYW5jZS5hZSJ9LCJNZXRhIjp7fSwiTGlua3MiOnsiU2VsZiI6Imh0dHBzOi8vcnMxLmFsdGFyZXExLnNhbmRib3guYXBpaHViLm9wZW5maW5hbmNlLmFlL29wZW4tZmluYW5jZS9jb25maXJtYXRpb24tb2YtcGF5ZWUvdjEuMi9kaXNjb3ZlcnkifX0sImlzcyI6Imh0dHBzOi8vYXV0aDEuYWx0YXJlcTEuc2FuZGJveC5hcGlodWIub3BlbmZpbmFuY2UuYWUiLCJleHAiOjE3NDcyOTUxMDcuMDk0LCJpYXQiOjE3NDcyOTQ1MDcuMDk0LCJuYmYiOjE3NDcyOTQ1MDcuMDk0LCJhdWQiOiJodHRwczovL3JwLnNhbmRib3guZGlyZWN0b3J5Lm9wZW5maW5hbmNlLmFlL29wZW5pZF9yZWx5aW5nX3BhcnR5LzkwYmFiODZlLTZjYmQtNDVmOS05MjNlLWJjYWVkYWQ4MGNmNCJ9.Z7gOngRG3FMpDd7-sNB6LzcvPdFKxLFFV4PqSCZdfRBWL2GgyOx2ZZ-BxcHUk2427uMXCDkt0D-hcXo4Nr05nnEe7HtHzYBg8lfJaWpFRGXwEK6_I1A4mDovAlsK7XYTZmvrHtFJm-u2UqdveAZPCWLzj8bUjVmor-f-MIeVjZyuAXYFxiX-wk6Skpf_7UhP9pB0Lkg75WNTTymHflDnXBXwyaUilNzGFfiaN0QUi5CMIBaiSQYJ7s4zsmD3aG-2fbawM7LQexQuX7vGEhEMbN9P_2qsUOmFfbaMRecGpDWplRZulRObyLK49TLrSZszf2OFsYOY5G_NDCJ8gc33NQ'
    }
  },
  // created() {
  //   if (!this.$route.params.state) {
  //     this.$router.push('error')
  //   }
  //   this.state = this.$route.params.state
  // },
  methods: {
    setPA(val) {
      this.payment_amount = val.data;
    },
     async makePayment() {
      try {
        const token = this.$route.query.token; 

        const config = {
          method: 'post',
          url: `/open-finance/payment/v1.2/payments`,
          data: {
            payment_amount: this.payment_amount,
            consent_id: this.$route.query.consent
          },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        };

        const response = await api.request(config);

        if (response.status === 201) {
          const jwt = response.data;
          const decoded = decodeJwt(jwt);
          this.displayedJson = decoded
          this.paymentIds.push(decoded.message.Data.PaymentId)
        } else {
          this.$router.push({ name: 'error' });
        }
      } catch (error) {
        console.error('❌ API Error:', error);
        this.$router.push({ name: 'error' });
      }
    },
  }
}
</script>