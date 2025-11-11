<template>
  <div class="text-section">
    <h1 class="text-section-title">
      Connect your account(s)
    </h1>
    <p>
      For you to use this service <strong>Model TPP</strong> need to access informatiom from your accounts at
      <strong>{{ bank }}</strong>.
    </p>
    <ToggleText header="Why do we need you to share your data"
      para="This is a test site designed for demonstration and testing purposes only. Any data you provide is used strictly to simulate functionality and user experience. No personal data is stored permanently—all information is automatically deleted within 24 hours. Your privacy and security are important to us, even in this testing environment." />
  </div>
  <div class="text-section">
    <h1 class="text-section-title">
      What we need you to share
    </h1>
    <div class="permission-container">
      <img class="permission-icon" src="../assets/icons/user.svg" alt="user" />
      <ToggleText header="Your Account Details"
        para="This is a test site designed for demonstration and testing purposes only. Any data you provide is used strictly to simulate functionality and user experience. No personal data is stored permanently—all information is automatically deleted within 24 hours. Your privacy and security are important to us, even in this testing environment." />
    </div>

    <div class="permission-container">
      <img class="permission-icon" src="../assets/icons/dollar-circle.svg" alt="user" />
      <ToggleText header="Your Regular Payments"
        para="This is a test site designed for demonstration and testing purposes only. Any data you provide is used strictly to simulate functionality and user experience. No personal data is stored permanently—all information is automatically deleted within 24 hours. Your privacy and security are important to us, even in this testing environment." />
    </div>

    <div class="permission-container">
      <img class="permission-icon" src="../assets/icons/wallet-2.svg" alt="user" />
      <ToggleText header="Your Account Transactions"
        para="This is a test site designed for demonstration and testing purposes only. Any data you provide is used strictly to simulate functionality and user experience. No personal data is stored permanently—all information is automatically deleted within 24 hours. Your privacy and security are important to us, even in this testing environment." />
    </div>

    <div class="permission-container">
      <img class="permission-icon" src="../assets/icons/receipt-edit.svg" alt="user" />
      <ToggleText header="Your Product Information"
        para="This is a test site designed for demonstration and testing purposes only. Any data you provide is used strictly to simulate functionality and user experience. No personal data is stored permanently—all information is automatically deleted within 24 hours. Your privacy and security are important to us, even in this testing environment." />
    </div>

    <div class="permission-container">
      <img class="permission-icon" src="../assets/icons/element-equal.svg" alt="user" />
      <ToggleText header="Contact and Party Details"
        para="This is a test site designed for demonstration and testing purposes only. Any data you provide is used strictly to simulate functionality and user experience. No personal data is stored permanently—all information is automatically deleted within 24 hours. Your privacy and security are important to us, even in this testing environment." />
    </div>

    <div style="display: flex; padding-top: 10px;">
      <img style="width: 25px; margin-right: 10px;" src="../assets/icons/calendar.svg" alt="user" />
      <div style="margin-top: auto; margin-bottom: auto">We will access your data until 25/12/2025. </div>
    </div>
  </div>
  <AlTareqButton @click="submit" />
  <div class="primary-button-suptext">
    Continue to <strong>Model Bank</strong> to share your account information under these terms.
  </div>
</template>


<script>
import ToggleText from '../components/ToggleText.vue';
import AlTareqButton from '../components/AlTareqButton.vue';

import api from '../api';

export default {
  components: {
    ToggleText,
    AlTareqButton,
  },
  created() {
    if (!this.bank) {
      this.$router.push({ name: 'consent-setup' })
    }
  },
  computed: {
    bank() {
      return this.$route.query.bank
    },
    tomorrow() {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      const yyyy = tomorrow.getFullYear();
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getDate()).padStart(2, '0');

      const formatted = `${dd}/${mm}/${yyyy}`;
      return formatted
    }
  },
  methods: {
    async submit() {
      this.$router.push({ name: 'redirect-screen' });
      const config = {
        method: 'post',
        url: '/consent-create/bank-data',
        data: {
          data_permissions: [
            'ReadAccountsBasic',
            'ReadAccountsDetail',
            'ReadBalances',
            'ReadBeneficiariesBasic',
            'ReadBeneficiariesDetail',
            'ReadTransactionsBasic',
            'ReadTransactionsDetail',
            'ReadTransactionsCredits',
            'ReadTransactionsDebits',
            'ReadScheduledPaymentsBasic',
            'ReadScheduledPaymentsDetail',
            'ReadDirectDebits',
            'ReadStandingOrdersBasic',
            'ReadStandingOrdersDetail',
            'ReadConsents',
            'ReadPartyUser',
            'ReadPartyUserIdentity',
            'ReadParty',
          ]
        }
      }
      const response = await api.request(config)
      window.location.href = response.data.redirect
    }
  }
}
</script>