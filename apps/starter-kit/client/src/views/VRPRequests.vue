<template>
  <div class="text-section">
    <h1 class="text-section-title">
      Payment Initiation
    </h1>
    <p>
      Please test the payment resources below for ModelBank:
    </p>
    <InputCurrency :input="paymentAmount" placeholder="Payment Amount" @output="setPA" />

    <br />
    <button @click="makePayment" class="thirdButton">
      Make Payment
    </button>

    <div style="color: red;">
    {{ error }}
    </div>

   <!--= <div v-if="paymentIds.length > 0">
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
      error: undefined,
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
          this.error = undefined
          const jwt = response.data;
          const decoded = decodeJwt(jwt);
          this.displayedJson = decoded
          this.paymentIds.push(decoded.message.Data.PaymentId)
        } else {
          this.$router.push({ name: 'error' });
        }
      } catch (error) {
        console.error('❌ API Error:', error);
        this.error = 'Payment rejected'
        this.displayedJson = undefined
      }
    },
  }
}
</script>