<template>
  <div class="text-section">
    <h1 class="text-section-title">
      Choose your option
    </h1>
    <SelectOptions :options="openFinanceFlows" @output="setOption" />
  </div>
  <div class="text-section">
    <h1 class="text-section-title">
      Select your bank
    </h1>
    <p>
    Choose your bank from the list below. You’ll be
    redirected to your bank’s website or app to securely authorize the connection.
    </p>
    <SelectProvider @output="setBank" />
  </div>
    <AlTareqButton @click="submit" />
</template>



<script>
import SelectOptions from '../components/SelectOptions.vue';
import SelectProvider from '../components/SelectProvider.vue';
import AlTareqButton from '../components/AlTareqButton.vue';


export default {
  components: {
    SelectOptions,
    SelectProvider,
    AlTareqButton,
  },
  data() {
    return {
      selectedOption: undefined,
      selectedBank: undefined,
      openFinanceFlows: [
        {
          description: 'Bank Data Sharing',
          active: true
        },
        {
          description: 'Single Instant Payment',
          active: true
        },
        {
          description: 'Multi Payment (Variable on Demand)',
          active: true
        },
        {
          description: 'Open Product Data',
          active: true
        },
        {
          description: 'Insurance Data Sharing',
          active: false
        },
      ]
    }
  },
  methods: {
    submit() {
      if(this.selectedOption === 'Bank Data Sharing' && this.selectedBank) {
      this.$router.push({name: 'data-permissions', query: {bank: this.selectedBank}})
      } else if (this.selectedOption === 'Single Instant Payment' && this.selectedBank) {
        this.$router.push({name: 'sip-permissions', query: {bank: this.selectedBank}})
      } else if (this.selectedOption === 'Multi Payment (Variable on Demand)' && this.selectedBank) {
        this.$router.push({name: 'vrp-permissions', query: {bank: this.selectedBank}})
      } else if (this.selectedOption === 'Open Product Data' && this.selectedBank) {
        this.$router.push({name: 'open-product-requests', query: {bank: this.selectedBank}})
      }
    },
    setOption(val) {
      this.selectedOption = val
    },
    setBank(val) {
      this.selectedBank = val
    }
  }
}
</script>