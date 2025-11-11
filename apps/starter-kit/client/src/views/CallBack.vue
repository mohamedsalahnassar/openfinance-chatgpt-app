<template>
  <div class="redirect-page">
    <div class="redirect-content">
      <div class="redirect-wheel">

      </div>
      <div class="redirect-text">
        You'll be redirected to <strong>Model TPP,</strong> don't close this window
      </div>
    </div>
    <div class="powered-by">
      Powered by
      <img class="powered-by-img" src="../assets/AlWhite.png" alt="AlTareq" />
    </div>
  </div>
</template>


<script>
import api from '../api';


export default {

  async created() {

    console.log(this.$route.query)

    const code = this.$route.query.code
    const state = this.$route.query.state
    if (!code || !state) {
      this.$router.push({ name: 'failed' })
      return;
    }

    console.log(state)

    const { code_verifier, consent_id } = JSON.parse(atob(state));

    console.log(code_verifier, consent_id)

    if (!code_verifier || !consent_id) {
      this.$router.push({ name: 'failed' })
      return;
    }

    const request = {
      code,
      code_verifier,
    }

    try {
      const config = {
        method: 'post',
        url: '/token/authorization-code',
        data: request,
      };

      const response = await api.request(config);

      const { data, status } = response;

      if (status === 200 || status === 201) {

        console.log(data.authorization_details?.[0])
        // Account Access Consent
        if (data.authorization_details?.[0]?.type?.startsWith('urn:openfinanceuae:account-access-consent')) {
          this.$router.push({ name: 'data-success', query: { consent: consent_id, token: data.access_token  } });
        }
        // Single Instant Payment
        else if (data.authorization_details?.[0]?.type?.startsWith('urn:openfinanceuae:service-initiation-consent') && data.authorization_details?.[0]?.Data?.ControlParameters?.ConsentSchedule?.SinglePayment?.Type === 'SingleInstantPayment' ) {
          this.$router.push({ name: 'sip-success', query: { consent: consent_id, token: data.access_token  } });
        }
        // Variable On Demand Payment
        else if (data.authorization_details?.[0]?.type?.startsWith('urn:openfinanceuae:service-initiation-consent') && data.authorization_details?.[0]?.Data?.ControlParameters?.ConsentSchedule?.MultiPayment) {
          this.$router.push({ name: 'vrp-success', query: { consent: consent_id, token: data.access_token  } });
        }
        else {
          this.$router.push({ name: 'failed' });
        }
      } else {
        this.$router.push({ name: 'failed' });
      }
    } catch (error) {

      this.$router.push({ name: 'failed' });
    }
  }
}

</script>
